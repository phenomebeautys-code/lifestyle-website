/**
 * reconcile-orders (PhenomeBeauty shop)
 * Confirms Yoco payments without relying on the Yoco webhook alone.
 *
 * Three ways in:
 *   1. Scheduled (pg_cron every 10 minutes, x-cron-secret) or service role: checks every unpaid
 *      order from the last 48 hours that has a Yoco checkout. Body { dry_run: true } writes nothing.
 *   2. Shopper return (public): shop-success.html sends { order_id, customer_token } as soon as
 *      the shopper is back from Yoco, so a paid order is confirmed within seconds even when the
 *      webhook is late or missing. Only that one order is checked, and only with its secret token.
 *   3. { mode: 'webhook_status' } (scheduled or service role only): lists the webhooks registered
 *      on the Yoco account (id, url, mode only) to diagnose missing webhook deliveries.
 *   4. { mode: 'webhook_register' } (scheduled or service role only): registers a fresh webhook for
 *      yoco-webhook and saves its signing secret privately in shop_settings.
 *
 * An order is marked paid only when Yoco reports the checkout as paid and the amount matches the
 * order total exactly. Then stock is consumed (idempotent), the payment emails are sent and the
 * order timeline records how the payment was confirmed.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOCO_SECRET_KEY = Deno.env.get('YOCO_SECRET_KEY') ?? '';

const WINDOW_HOURS = 48;
const MAX_ORDERS_PER_RUN = 50;
// Only these Yoco statuses mean money has landed. Anything else is left alone.
const PAID_STATUSES = new Set(['succeeded', 'completed', 'paid']);
const SITE_ORIGINS = ['https://www.phenomebeauty.co.za', 'https://phenomebeauty.co.za'];
const PREVIEW = /^https:\/\/[a-z0-9-]+-phenomebeautys-codes-projects\.vercel\.app$/;

type OrderRow = { id: string; total_amount: string | number; yoco_checkout_id: string };

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* A few checks a minute per address is plenty for a shopper coming back from Yoco. */
const attempts = new Map<string, { n: number; at: number }>();
function tooMany(ip: string) {
  const now = Date.now(), a = attempts.get(ip);
  if (!a || now - a.at > 60_000) { attempts.set(ip, { n: 1, at: now }); return false; }
  a.n += 1;
  return a.n > 12;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': SITE_ORIGINS.includes(origin) || PREVIEW.test(origin) ? origin : SITE_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
    Vary: 'Origin',
  };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!YOCO_SECRET_KEY) return json({ error: 'YOCO_SECRET_KEY not set' }, 500);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body: a scheduled run */ }
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  /* 2. A shopper back from Yoco: check just their order. */
  if (typeof body?.order_id === 'string' && typeof body?.customer_token === 'string') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    if (tooMany(ip)) return json({ error: 'Too many checks. Wait a minute.' }, 429);
    const { data: order } = await db.from('shop_orders')
      .select('id, total_amount, yoco_checkout_id, payment_status, customer_token')
      .eq('id', body.order_id).maybeSingle();
    if (!order || !sameSecret(String(order.customer_token || ''), body.customer_token)) return json({ error: 'Order not found' }, 404);
    if (order.payment_status === 'paid') return json({ paid: true });
    if (typeof order.yoco_checkout_id !== 'string' || !order.yoco_checkout_id.startsWith('ch_')) return json({ paid: false });
    const result = await reconcileOne(db, order as OrderRow, false, 'shopper return');
    return json({ paid: result.action === 'marked_paid' || result.action === 'already_handled' });
  }

  /* Everything else is for the scheduler and the service role only. */
  const service = req.headers.get('authorization') === `Bearer ${SERVICE_KEY}`;
  let cron = false;
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!service && given) {
    const { data } = await db.from('shop_settings').select('value').eq('key', 'reconcile_cron_secret').maybeSingle();
    cron = sameSecret(given, typeof data?.value?.secret === 'string' ? data.value.secret : '');
  }
  if (!service && !cron) return json({ error: 'Forbidden' }, 403);

  /* 3. Which webhooks Yoco has on record (no signing secrets are returned). */
  if (body?.mode === 'webhook_status') {
    const res = await fetch('https://payments.yoco.com/api/webhooks', { headers: { Authorization: `Bearer ${YOCO_SECRET_KEY}`, Accept: 'application/json' } });
    const data = await res.json().catch(() => null);
    // deno-lint-ignore no-explicit-any
    const list = (Array.isArray(data) ? data : data?.subscriptions || data?.webhooks || data?.data || []) as any[];
    return json({ ok: res.ok, status: res.status, expected_url: `${SUPABASE_URL}/functions/v1/yoco-webhook`,
      webhooks: list.map(w => ({ id: w.id, name: w.name, url: w.url, mode: w.mode, matches: w.url === `${SUPABASE_URL}/functions/v1/yoco-webhook` })) });
  }

  /* 4. Register a fresh webhook with Yoco. The signing secret is stored in shop_settings (private,
     read by yoco-webhook) and never returned. Used when Yoco has stopped delivering to the old one. */
  if (body?.mode === 'webhook_register') {
    const target = `${SUPABASE_URL}/functions/v1/yoco-webhook`;
    const res = await fetch('https://payments.yoco.com/api/webhooks', {
      method: 'POST', headers: { Authorization: `Bearer ${YOCO_SECRET_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: `phenomebeauty-shop-${new Date().toISOString().slice(0, 10)}`, url: target }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.secret !== 'string' || !data.secret) return json({ ok: false, status: res.status, error: data?.message || data?.error || 'Yoco did not return a webhook secret' }, 502);
    const { error: saveErr } = await db.from('shop_settings').upsert({
      key: 'yoco_webhook_secret', value: { secret: data.secret, id: data.id, registered_at: new Date().toISOString() }, updated_at: new Date().toISOString(), updated_by: 'reconcile-orders',
    }, { onConflict: 'key' });
    if (saveErr) return json({ ok: false, error: `Registered ${data.id} but could not save its secret: ${saveErr.message}` }, 500);
    return json({ ok: true, id: data.id, url: data.url, mode: data.mode });
  }

  /* 1. Scheduled sweep. */
  const dryRun = body?.dry_run === true;
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const { data: orders, error } = await db.from('shop_orders')
    .select('id, total_amount, yoco_checkout_id')
    .eq('payment_status', 'unpaid').gte('created_at', since).like('yoco_checkout_id', 'ch_%')
    .limit(MAX_ORDERS_PER_RUN);
  if (error) return json({ error: `Could not read orders: ${error.message}` }, 500);
  const results = [];
  for (const order of (orders ?? []) as OrderRow[]) results.push(await reconcileOne(db, order, dryRun, 'scheduled check'));
  return json({ ok: true, dry_run: dryRun, checked: results.length, results });
});

async function reconcileOne(db: SupabaseClient, order: OrderRow, dryRun: boolean, via: string) {
  const res = await fetch(`https://payments.yoco.com/api/checkouts/${encodeURIComponent(order.yoco_checkout_id)}`, {
    headers: { Authorization: `Bearer ${YOCO_SECRET_KEY}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { order_id: order.id, action: 'skip', reason: `yoco_http_${res.status}` };

  const yocoStatus = String(body?.status ?? '').toLowerCase();
  if (!PAID_STATUSES.has(yocoStatus)) return { order_id: order.id, action: 'none', yoco_status: yocoStatus || 'unknown' };

  // Amount guard: Yoco amounts are in cents. Refuse to mark paid on any mismatch.
  const orderCents = Math.round(Number(order.total_amount) * 100);
  const yocoCents = Number(body?.amount);
  if (!Number.isFinite(yocoCents) || yocoCents !== orderCents) {
    return { order_id: order.id, action: 'skip', reason: 'amount_mismatch', yoco_cents: body?.amount ?? null, order_cents: orderCents };
  }
  if (body?.metadata?.order_id && body.metadata.order_id !== order.id) return { order_id: order.id, action: 'skip', reason: 'order_mismatch' };

  const paymentId: string | null = body?.paymentId ?? body?.payment_id ?? null;
  if (!paymentId) return { order_id: order.id, action: 'skip', reason: 'yoco_payment_id_missing' };
  if (dryRun) return { order_id: order.id, action: 'would_mark_paid', yoco_status: yocoStatus, payment_id: paymentId };

  // Atomic: only flips rows that are still unpaid, so it can't race the webhook or another check.
  const { data: updated, error: updateErr } = await db.from('shop_orders')
    .update({ payment_status: 'paid', status: 'confirmed', payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq('id', order.id).eq('payment_status', 'unpaid').select('id');
  if (updateErr) return { order_id: order.id, action: 'error', reason: updateErr.message };
  if (!updated || updated.length === 0) return { order_id: order.id, action: 'already_handled' };

  const fulfilment = await fulfil(db, order, via);
  return { order_id: order.id, action: 'marked_paid', payment_id: paymentId, fulfilment };
}

// Stock, emails and the timeline. All non-fatal: the order is already paid.
async function fulfil(db: SupabaseClient, order: OrderRow, via: string) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
  const note = async (message: string) => {
    try { await db.from('order_events').insert({ order_id: order.id, actor: 'system', kind: 'payment', message }); } catch { /* best effort */ }
  };
  await note(`Payment confirmed with Yoco (${via}).`);

  let stock: unknown = null;
  try {
    const stockRes = await fetch(`${SUPABASE_URL}/functions/v1/consume-order-stock`, { method: 'POST', headers, body: JSON.stringify({ order_id: order.id }) });
    stock = await stockRes.json().catch(() => null);
    if (!stockRes.ok) { console.error('[reconcile-orders] consume-order-stock failed:', stockRes.status, stock); await note('Stock could not be updated automatically. Check Inventory.'); }
  } catch (err) { console.error('[reconcile-orders] consume-order-stock error:', err); }

  let email: unknown = null;
  try {
    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, { method: 'POST', headers, body: JSON.stringify({ type: 'payment_received', order_id: order.id }) });
    const result = await emailRes.json().catch(() => null);
    email = { status: emailRes.status, result };
    if (!emailRes.ok) { console.error('[reconcile-orders] send-order-email failed:', emailRes.status, result); await note('The payment confirmation email failed to send.'); }
  } catch (err) {
    console.error('[reconcile-orders] send-order-email error:', err);
    email = { error: String(err) };
  }
  return { stock, email };
}
