import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CAMPAIGN_KEYS, normaliseSettings, renderCampaign, unsubscribeUrl } from '../_shared/campaigns.mjs';
import { describeDiscount } from '../_shared/discounts.mjs';

/**
 * run-campaigns: sends the automated emails the owner switched on in admin → Email campaigns.
 *
 * Called hourly by pg_cron (x-cron-secret header, matched against CAMPAIGN_CRON_SECRET or the private
 * shop_settings row 'campaign_cron_secret'), and by shop-admin (service role) for
 * "Preview", "Send test" and "Send now". Body: { mode, key?, settings?, to? }
 *   mode 'run'      send what is due (default)
 *   mode 'dry_run'  list what is due, send nothing
 *   mode 'preview'  return the rendered email for the given settings
 *   mode 'test'     send the rendered email to `to` only
 *
 * Who is emailed: paid, not cancelled orders, paid after the campaign was switched on and at least
 * `delay_days` ago, whose customer has not unsubscribed. Each order gets each campaign once.
 * Review requests skip fully refunded orders; running-low reminders skip customers who have
 * already ordered again.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CAMPAIGN_CRON_SECRET') ?? '';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = 'PhenomeBeauty <hello@phenomebeauty.co.za>';
const REPLY_TO = 'phenomebeautys@gmail.com';
const MAX_PER_RUN = 40;
const SAMPLE_ORDER = { customer_name: 'Thandi Mokoena', items: [{ name: 'Refine Body Scrub' }, { name: 'Restore Body Butter' }] };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
async function activeDiscount(supabase: any, code: string | null) {
  if (!code) return null;
  const { data } = await supabase.from('discount_codes').select('code, kind, value, active, starts_at, ends_at').eq('code', code).maybeSingle();
  const now = new Date();
  if (!data || data.active !== true || (data.starts_at && now < new Date(data.starts_at)) || (data.ends_at && now >= new Date(data.ends_at))) return null;
  return { code: data.code, label: describeDiscount(data) };
}

async function sendEmail(to: string, subject: string, html: string, text: string, unsub: string) {
  if (!RESEND_KEY) throw new Error('Email provider is not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [to], subject, html, text, reply_to: REPLY_TO,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  if (!res.ok) throw new Error(`Email provider rejected the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const service = req.headers.get('authorization') === `Bearer ${SERVICE_KEY}`;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const given = req.headers.get('x-cron-secret') ?? '';
  let cron = false;
  if (!service && given) {
    let expected = CRON_SECRET;
    if (!expected) {
      const { data } = await supabase.from('shop_settings').select('value').eq('key', 'campaign_cron_secret').maybeSingle();
      expected = typeof data?.value?.secret === 'string' ? data.value.secret : '';
    }
    cron = sameSecret(given, expected);
  }
  if (!service && !cron) return json({ error: 'Forbidden' }, 403);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body: run */ }
  const mode = ['run', 'dry_run', 'preview', 'test'].includes(body?.mode) ? body.mode : 'run';
  if (cron && mode !== 'run') return json({ error: 'Forbidden' }, 403);

  /* Preview and test use the settings being edited, before they are saved. */
  if (mode === 'preview' || mode === 'test') {
    if (!CAMPAIGN_KEYS.includes(body.key)) return json({ error: 'Unknown campaign' }, 400);
    const checked = normaliseSettings(body.key, body.settings);
    if (checked.error) return json({ error: checked.error }, 400);
    const discount = body.key === 'replenishment' ? await activeDiscount(supabase, checked.settings.discount_code) : null;
    const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
    const unsub = await unsubscribeUrl(SUPABASE_URL, to || 'preview@example.com', SERVICE_KEY);
    const email = renderCampaign(body.key, checked.settings, SAMPLE_ORDER, discount, unsub);
    if (mode === 'preview') return json({ ...email, discount_applied: !!discount });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'No test address' }, 400);
    try {
      await sendEmail(to, `[Test] ${email.subject}`, email.html, email.text, unsub);
      await supabase.from('campaign_sends').insert({ campaign: body.key, order_id: null, email: to, status: 'test' });
      return json({ ok: true, sent_to: to });
    } catch (err) {
      return json({ error: String((err as Error).message || err) }, 502);
    }
  }

  /* Run or dry run. */
  const { data: rows, error: rowsError } = await supabase.from('email_campaigns').select('*');
  if (rowsError) return json({ error: rowsError.message }, 500);
  const results: Record<string, unknown> = {};
  let budget = MAX_PER_RUN;

  for (const row of rows ?? []) {
    if (body.key && row.key !== body.key) continue;
    if (!row.enabled || !row.enabled_at) { results[row.key] = { skipped: 'off' }; continue; }
    const checked = normaliseSettings(row.key, row.settings);
    if (checked.error) { results[row.key] = { skipped: checked.error }; continue; }
    const settings = checked.settings;
    const cutoff = new Date(Date.now() - settings.delay_days * 86_400_000).toISOString();

    const { data: orders, error } = await supabase.from('shop_orders')
      .select('id, created_at, paid_at, customer_name, customer_email, items, total_amount, refunded_amount')
      .eq('payment_status', 'paid').is('cancelled_at', null)
      .gte('paid_at', row.enabled_at).lte('paid_at', cutoff)
      .order('paid_at', { ascending: true }).limit(200);
    if (error) { results[row.key] = { error: error.message }; continue; }

    const ids = (orders ?? []).map((o: { id: string }) => o.id);
    const emails = [...new Set((orders ?? []).map((o: { customer_email: string }) => String(o.customer_email || '').toLowerCase()).filter(Boolean))];
    const [{ data: done }, { data: optouts }] = await Promise.all([
      ids.length ? supabase.from('campaign_sends').select('order_id').eq('campaign', row.key).in('order_id', ids) : Promise.resolve({ data: [] }),
      emails.length ? supabase.from('email_optouts').select('email').in('email', emails) : Promise.resolve({ data: [] }),
    ]);
    const doneSet = new Set((done ?? []).map((d: { order_id: string }) => d.order_id));
    const optSet = new Set((optouts ?? []).map((d: { email: string }) => d.email));
    const discount = row.key === 'replenishment' ? await activeDiscount(supabase, settings.discount_code) : null;

    const due: Array<{ order_id: string; email: string }> = [];
    const sent: string[] = [];
    const failed: Array<{ order_id: string; error: string }> = [];
    let skipped = 0;
    for (const o of orders ?? []) {
      if (budget <= 0) break;
      const email = String(o.customer_email || '').trim().toLowerCase();
      if (!email || doneSet.has(o.id)) continue;
      if (optSet.has(email)) { skipped++; continue; }
      if (row.key === 'review_request' && Number(o.refunded_amount || 0) >= Number(o.total_amount)) { skipped++; continue; }
      if (row.key === 'replenishment') {
        const { count } = await supabase.from('shop_orders').select('id', { count: 'exact', head: true })
          .ilike('customer_email', email).eq('payment_status', 'paid').is('cancelled_at', null).gt('created_at', o.created_at);
        if ((count || 0) > 0) { skipped++; continue; }
      }
      if (mode === 'dry_run') { due.push({ order_id: o.id, email }); budget--; continue; }

      // Claim the order first; the unique key means a parallel run cannot email it again.
      const { error: claimError } = await supabase.from('campaign_sends').insert({ campaign: row.key, order_id: o.id, email, status: 'sent' });
      if (claimError) continue;
      budget--;
      try {
        const unsub = await unsubscribeUrl(SUPABASE_URL, email, SERVICE_KEY);
        const msg = renderCampaign(row.key, settings, o, discount, unsub);
        await sendEmail(email, msg.subject, msg.html, msg.text, unsub);
        sent.push(o.id);
      } catch (err) {
        const detail = String((err as Error).message || err).slice(0, 300);
        await supabase.from('campaign_sends').update({ status: 'failed', detail }).eq('campaign', row.key).eq('order_id', o.id);
        failed.push({ order_id: o.id, error: detail });
      }
    }
    results[row.key] = mode === 'dry_run' ? { due: due.length, orders: due, skipped } : { sent: sent.length, failed, skipped };
  }
  return json({ ok: true, mode, results });
});
