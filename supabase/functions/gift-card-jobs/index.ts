import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { giftCardExpiry, loadGiftSettings, newGiftCode, renderGiftCardEmail } from '../_shared/gift-cards.mjs';

/**
 * gift-card-jobs: keeps gift cards in step with orders. Runs every 5 minutes (pg_cron) and on
 * request from shop-admin (service role).
 *
 * Body { mode }:
 *   'run'     issue and email cards for paid gift card orders; mark held amounts as spent for paid
 *             orders; give back held amounts for orders that were cancelled or left unpaid for 24 hours;
 *             take the amount again if an order is paid after its hold was given back
 *   'issue'   (admin) create a card: { amount, recipient_name, recipient_email, sender_name, message, send_email, actor }
 *   'resend'  (admin) email a card again: { card_id }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = 'PhenomeBeauty <hello@phenomebeauty.co.za>';
const HOLD_MINUTES = 24 * 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
async function emailCard(supabase: any, card: any) {
  if (!card.recipient_email) return { ok: false, error: 'No recipient email' };
  if (!RESEND_KEY) return { ok: false, error: 'Email provider is not configured' };
  const msg = renderGiftCardEmail(card, (await loadGiftSettings(supabase)).amounts);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [card.recipient_email], subject: msg.subject, html: msg.html, text: msg.text, reply_to: 'phenomebeautys@gmail.com' }),
  });
  if (!res.ok) return { ok: false, error: `Email provider rejected the email (${res.status})` };
  await supabase.from('gift_cards').update({ emailed_at: new Date().toISOString() }).eq('id', card.id);
  return { ok: true };
}

// deno-lint-ignore no-explicit-any
async function createCard(supabase: any, fields: any) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from('gift_cards').insert({ ...fields, code: newGiftCode(), balance: fields.initial_amount, expires_at: giftCardExpiry() })
      .select('*').maybeSingle();
    if (data) {
      await supabase.from('gift_card_ledger').insert({ card_id: data.id, change: data.initial_amount, kind: 'issue', order_id: fields.purchase_order_id || null, actor: fields.created_by });
      return { card: data };
    }
    if (error && error.code === '23505' && String(error.message).includes('purchase_order_id')) return { duplicate: true };
    if (error && error.code !== '23505') return { error: error.message };
  }
  return { error: 'Could not create a unique code' };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const service = req.headers.get('authorization') === `Bearer ${SERVICE_KEY}`;
  let cron = false;
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!service && given) {
    const { data } = await supabase.from('shop_settings').select('value').eq('key', 'campaign_cron_secret').maybeSingle();
    cron = sameSecret(given, typeof data?.value?.secret === 'string' ? data.value.secret : '');
  }
  if (!service && !cron) return json({ error: 'Forbidden' }, 403);
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* run */ }
  const mode = ['run', 'issue', 'resend'].includes(body?.mode) ? body.mode : 'run';
  if (cron && mode !== 'run') return json({ error: 'Forbidden' }, 403);

  if (mode === 'issue') {
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const email = clean(body.recipient_email, 254).toLowerCase();
    if (!(amount >= 10 && amount <= 50000)) return json({ error: 'Choose an amount between R10 and R50 000.' }, 400);
    if (email && !EMAIL_RE.test(email)) return json({ error: 'Check the recipient email address.' }, 400);
    if (body.send_email && !email) return json({ error: 'Add the recipient email to send the card.' }, 400);
    const out = await createCard(supabase, {
      initial_amount: amount, recipient_name: clean(body.recipient_name, 120) || null, recipient_email: email || null,
      sender_name: clean(body.sender_name, 120) || null, message: clean(body.message, 500) || null, source: 'admin', created_by: clean(body.actor, 254) || 'admin',
    });
    if (!out.card) return json({ error: out.error || 'Could not create the card' }, 500);
    const emailed = body.send_email ? await emailCard(supabase, out.card) : null;
    return json({ card: out.card, emailed });
  }

  if (mode === 'resend') {
    const { data: card } = await supabase.from('gift_cards').select('*').eq('id', body.card_id).maybeSingle();
    if (!card) return json({ error: 'Gift card not found' }, 404);
    const emailed = await emailCard(supabase, card);
    return emailed.ok ? json({ ok: true }) : json({ error: emailed.error }, 502);
  }

  /* Run: issue cards for paid gift card orders. */
  const issued: string[] = [];
  const problems: string[] = [];
  const { data: giftOrders } = await supabase.from('shop_orders')
    .select('id, customer_name, delivery_meta, total_amount, payment_status, cancelled_at')
    .eq('delivery_method', 'digital').eq('payment_status', 'paid').is('cancelled_at', null)
    .order('paid_at', { ascending: true }).limit(100);
  const ids = (giftOrders ?? []).map((o: { id: string }) => o.id);
  const { data: existing } = ids.length ? await supabase.from('gift_cards').select('purchase_order_id').in('purchase_order_id', ids) : { data: [] };
  const done = new Set((existing ?? []).map((c: { purchase_order_id: string }) => c.purchase_order_id));
  for (const o of giftOrders ?? []) {
    const g = o.delivery_meta && o.delivery_meta.gift_card;
    if (done.has(o.id) || !g) continue;
    const out = await createCard(supabase, {
      initial_amount: Number(o.total_amount), recipient_name: g.recipient_name || null, recipient_email: String(g.recipient_email || '').toLowerCase() || null,
      sender_name: g.sender_name || o.customer_name || null, message: g.message || null, source: 'online', purchase_order_id: o.id, created_by: 'shop',
    });
    if (out.duplicate) continue;
    if (!out.card) { problems.push(`${o.id}: ${out.error}`); continue; }
    const emailed = await emailCard(supabase, out.card);
    if (!emailed.ok) problems.push(`${o.id}: ${emailed.error}`);
    issued.push(o.id);
    try {
      await supabase.from('order_events').insert({ order_id: o.id, actor: 'system', kind: 'status',
        message: emailed.ok ? `Gift card ending ${out.card.code.slice(-4)} emailed to ${out.card.recipient_email}.` : `Gift card ending ${out.card.code.slice(-4)} created; the email failed and can be resent from Gift cards.` });
    } catch { /* timeline is best effort */ }
  }

  /* Run: settle or release held amounts. */
  const { data: holds } = await supabase.from('gift_card_ledger').select('order_id, at').eq('kind', 'hold').eq('hold_state', 'held').limit(500);
  const holdOrders = [...new Set((holds ?? []).map((h: { order_id: string }) => h.order_id).filter(Boolean))];
  const { data: orders } = holdOrders.length ? await supabase.from('shop_orders').select('id, payment_status, cancelled_at, created_at').in('id', holdOrders) : { data: [] };
  const byId = new Map((orders ?? []).map((o: { id: string }) => [o.id, o]));
  let settled = 0, released = 0;
  const stale = Date.now() - HOLD_MINUTES * 60_000;
  for (const id of holdOrders) {
    // deno-lint-ignore no-explicit-any
    const o: any = byId.get(id);
    const heldAt = Math.min(...(holds ?? []).filter((h: { order_id: string }) => h.order_id === id).map((h: { at: string }) => new Date(h.at).getTime()));
    if (o && o.payment_status === 'paid' && !o.cancelled_at) { await supabase.rpc('gift_card_settle', { p_order: id }); settled++; continue; }
    const reason = o && o.cancelled_at ? 'Order cancelled' : (o ? new Date(o.created_at).getTime() : heldAt) < stale ? 'Order not paid within 24 hours' : null;
    if (reason) { await supabase.rpc('gift_card_release', { p_order: id, p_note: reason }); released++; }
  }
  /* Run: an order paid after its hold was given back takes the gift card amount again. */
  const { data: paidWithCard } = await supabase.from('shop_orders').select('id, gift_card_id, gift_card_amount, paid_at')
    .eq('payment_status', 'paid').gt('gift_card_amount', 0).gte('paid_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(200);
  let reheld = 0;
  for (const o of paidWithCard ?? []) {
    const { data: rows } = await supabase.from('gift_card_ledger').select('hold_state').eq('order_id', o.id).eq('kind', 'hold');
    if ((rows ?? []).some((r: { hold_state: string }) => r.hold_state === 'held' || r.hold_state === 'redeemed')) continue;
    const { count: flagged } = await supabase.from('order_events').select('id', { count: 'exact', head: true }).eq('order_id', o.id).like('message', 'Check this order: it was paid after its gift card hold ended%');
    if ((flagged || 0) > 0) continue;
    const { data: card } = await supabase.from('gift_cards').select('code').eq('id', o.gift_card_id).maybeSingle();
    const cents = Math.round(Number(o.gift_card_amount) * 100);
    const { data: held, error } = card ? await supabase.rpc('gift_card_hold', { p_code: card.code, p_order: o.id, p_max_cents: cents, p_actor: 'system' }) : { data: null, error: { message: 'card missing' } };
    const row = Array.isArray(held) ? held[0] : held;
    if (!error && row && Math.round(Number(row.out_held) * 100) === cents) {
      await supabase.rpc('gift_card_settle', { p_order: o.id });
      reheld++;
    } else {
      problems.push(`${o.id}: paid after its gift card hold ended and the card no longer covers R${(cents / 100).toFixed(2)}`);
      try { await supabase.from('order_events').insert({ order_id: o.id, actor: 'system', kind: 'note', message: `Check this order: it was paid after its gift card hold ended, and only part or none of R${(cents / 100).toFixed(2)} could be taken from the card again.` }); } catch { /* best effort */ }
      if (row) await supabase.rpc('gift_card_settle', { p_order: o.id });
    }
  }
  return json({ ok: true, issued: issued.length, problems, settled, released, reheld });
});
