import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadGiftSettings } from '../_shared/gift-cards.mjs';
import { corsOrigin, isSiteOrigin } from '../_shared/site-origin.ts';

/**
 * buy-gift-card: creates a gift card order and a Yoco checkout for it.
 *
 * The amount must be one the owner offers (admin → Gift cards). The order is a normal shop order
 * with delivery_method 'digital', so the existing Yoco webhook and reconciliation mark it paid and
 * send the receipt. The gift-card-jobs function then issues the card and emails the recipient.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async req => {
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(req.headers.get('origin') || ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
    'Content-Type': 'application/json',
  };
  const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch { return respond({ error: 'Invalid JSON' }, 400); }
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(url, key);
    const settings = await loadGiftSettings(supabase);
    if (!settings.enabled) return respond({ error: 'Gift cards are not on sale right now.' }, 409);

    const amount = Number(body?.amount);
    if (!settings.amounts.includes(amount)) return respond({ error: 'Choose one of the gift card amounts.' }, 400);
    const buyer = { name: clean(body?.buyer_name, 120), email: clean(body?.buyer_email, 254).toLowerCase(), phone: clean(body?.buyer_phone, 40) };
    const recipient = { name: clean(body?.recipient_name, 120), email: clean(body?.recipient_email, 254).toLowerCase() };
    const sender = clean(body?.sender_name, 120) || buyer.name;
    const message = clean(body?.message, 500);
    if (!buyer.name || !EMAIL_RE.test(buyer.email) || !buyer.phone) return respond({ error: 'Enter your name, email and phone number.' }, 400);
    if (!recipient.name || !EMAIL_RE.test(recipient.email)) return respond({ error: "Enter the recipient's name and email address." }, 400);

    let successUrl, cancelUrl;
    try { successUrl = new URL(body?.success_url); cancelUrl = new URL(body?.cancel_url); } catch { return respond({ error: 'Invalid return URL' }, 400); }
    if ([successUrl, cancelUrl].some(u => !isSiteOrigin(u.origin) || u.username || u.password)) {
      return respond({ error: 'Payment return URLs must use the official PhenomeBeauty domain' }, 400);
    }

    const item = { productId: 'gift-card', name: 'Phenomebeauty gift card', price: amount, qty: 1, variant: `For ${recipient.name}` };
    const { data: order, error } = await supabase.from('shop_orders').insert({
      customer_name: buyer.name, customer_email: buyer.email, customer_phone: buyer.phone,
      delivery_method: 'digital', delivery_address: `Emailed to ${recipient.email}`,
      delivery_meta: { gift_card: { amount, recipient_name: recipient.name, recipient_email: recipient.email, sender_name: sender, message } },
      items: [item], subtotal: amount, delivery_fee: 0, discount_amount: 0, gift_card_amount: 0, total_amount: amount,
      notes: `Gift card for ${recipient.name}`, payment_status: 'unpaid', status: 'pending', is_gift: true, gift_message: message || null,
    }).select('id, customer_token').single();
    if (error || !order) return respond({ error: 'Could not create the gift card order. Please retry.' }, 500);

    const secret = Deno.env.get('YOCO_SECRET_KEY');
    if (!secret) return respond({ error: 'Payment provider unavailable' }, 503);
    successUrl.searchParams.set('payment', 'success');
    successUrl.searchParams.set('order_id', order.id);
    successUrl.searchParams.set('ct', order.customer_token);
    const provider = await fetch('https://payments.yoco.com/api/checkouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ amount: Math.round(amount * 100), currency: 'ZAR', cancelUrl: cancelUrl.toString(),
        successUrl: successUrl.toString(), metadata: { order_id: order.id, customer_email: buyer.email } }),
    });
    const checkout = await provider.json().catch(() => null);
    const redirectUrl = checkout?.redirectUrl ?? checkout?.url;
    if (!provider.ok || typeof checkout?.id !== 'string' || !checkout.id.startsWith('ch_') || !redirectUrl) {
      return respond({ error: 'Payment provider error. Please retry.' }, 502);
    }
    const { data: saved } = await supabase.from('shop_orders').update({ yoco_checkout_id: checkout.id })
      .eq('id', order.id).eq('payment_status', 'unpaid').select('id').maybeSingle();
    if (!saved) return respond({ error: 'Could not save payment checkout. Do not pay; contact the shop.' }, 503);
    return respond({ redirectUrl, order_id: order.id });
  } catch {
    return respond({ error: 'Could not prepare payment. Please retry.' }, 503);
  }
});
