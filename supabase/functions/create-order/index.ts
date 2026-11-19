import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CartError, trustedCart } from '../_shared/trusted-cart.mjs';
import { loadFreeDelivery, qualifiesForFreeDelivery } from '../_shared/free-delivery.mjs';
import { evaluateDiscount, MIN_PAYABLE_CENTS } from '../_shared/discounts.mjs';
import { giftCardError, normaliseGiftCode } from '../_shared/gift-cards.mjs';

import { corsOrigin, isSiteOrigin } from '../_shared/site-origin.ts';
Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(origin),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
    'Content-Type': 'application/json',
  };
  const respond = (data, status = 200) => new Response(JSON.stringify(data), {status, headers});
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') return respond({error: 'Method not allowed'}, 405);
  let body;
  try { body = await req.json(); } catch { return respond({error: 'Invalid JSON'}, 400); }
  try {
    const {customer, delivery_method, delivery_address, locker_id, locker_name, locker_address, cart} = body || {};
    if (!customer || ['name', 'email', 'phone'].some(key => typeof customer[key] !== 'string' || !customer[key].trim())) {
      return respond({error: 'Missing customer details'}, 400);
    }
    if (!['door', 'locker'].includes(delivery_method)) return respond({error: 'Unsupported delivery method'}, 400);
    if (!Array.isArray(cart) || !cart.length || cart.length > 100) return respond({error: 'Invalid cart'}, 400);
    let address;
    if (delivery_method === 'door') {
      if (['street', 'suburb', 'city', 'postal', 'province'].some(key => typeof delivery_address?.[key] !== 'string' || !delivery_address[key].trim())) {
        return respond({error: 'Missing delivery address'}, 400);
      }
      address = ['street', 'suburb', 'city', 'postal', 'province'].map(key => delivery_address[key].trim()).join(', ');
    } else {
      if ([locker_id, locker_name, locker_address].some(value => typeof value !== 'string' || !value.trim())) {
        return respond({error: 'Select a delivery locker'}, 400);
      }
      address = [locker_name, locker_address].join(' -- ');
    }
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(url, key);
    const ids = [...new Set(cart.map(item => item?.productId || item?.id))];
    if (ids.some(id => typeof id !== 'string' || !id)) return respond({error: 'Invalid product'}, 400);
    const {data: products, error: productError} = await supabase.from('products')
      .select('id, name, price, variants, sizes, image_url, active, availability').in('id', ids);
    if (productError || !products) return respond({error: 'Could not validate products'}, 503);
    const trusted = trustedCart(cart, products);
    const quoteResponse = await fetch(`${url}/functions/v1/get-shipping-quote`, {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key},
      body: JSON.stringify({items: trusted.shippingItems}),
    });
    const quote = await quoteResponse.json().catch(() => null);
    if (!quoteResponse.ok || !quote || quote.error) return respond({error: 'Delivery quote unavailable. Please retry.'}, 503);
    const rawFee = delivery_method === 'locker' ? quote.locker_fee : quote.door_fee;
    const fee = Number(rawFee);
    if (quote.oversized || rawFee == null || !Number.isFinite(fee) || fee < 0) {
      return respond({error: 'This cart cannot use a standard delivery rate. Please contact the shop.'}, 409);
    }
    // A discount code is checked again here, against the trusted subtotal and the customer's email.
    let discount = null;
    if (typeof body.discount_code === 'string' && body.discount_code.trim()) {
      discount = await evaluateDiscount(supabase, body.discount_code, trusted.subtotalCents, customer.email);
      if (!discount.ok) return respond({error: discount.error, discount_error: true}, 409);
    }
    const discountCents = discount ? discount.discountCents : 0;
    // Free delivery: from a free-delivery code, or over the owner's threshold (after any discount).
    const freeDelivery = (discount?.freeDelivery === true)
      || qualifiesForFreeDelivery(trusted.subtotalCents - discountCents, delivery_method, await loadFreeDelivery(supabase));
    const feeCents = freeDelivery ? 0 : Math.round(fee * 100);
    // A browser that missed the free-delivery setting shows the normal fee; charging less than shown is fine.
    if (!freeDelivery && body.delivery_fee != null && (!Number.isFinite(Number(body.delivery_fee)) || Math.round(Number(body.delivery_fee) * 100) !== feeCents)) {
      return respond({error: 'Delivery rate changed. Refresh your delivery selection before paying.'}, 409);
    }
    const instructions = typeof body.special_instructions === 'string' ? body.special_instructions : '';
    const deliveryMeta = delivery_method === 'door'
      ? {...delivery_address, special_instructions: instructions, free_delivery: freeDelivery}
      : {locker_id, locker_name, locker_address, special_instructions: instructions, free_delivery: freeDelivery};
    // A gift card pays for part of the order. The amount is held on the card now and given back
    // if the order is not paid. At least R10 is always left to pay through Yoco.
    const orderId = crypto.randomUUID();
    const beforeCardCents = trusted.subtotalCents - discountCents + feeCents;
    let giftCard = null;
    if (typeof body.gift_card_code === 'string' && body.gift_card_code.trim()) {
      const giftCode = normaliseGiftCode(body.gift_card_code);
      if (!giftCode) return respond({error: 'Gift card codes look like PB-XXXX-XXXX-XXXX.', gift_card_error: true}, 409);
      const maxCents = beforeCardCents - MIN_PAYABLE_CENTS;
      if (maxCents <= 0) return respond({error: 'This order is too small to use a gift card on.', gift_card_error: true}, 409);
      const {data: held, error: holdError} = await supabase.rpc('gift_card_hold', {p_code: giftCode, p_order: orderId, p_max_cents: maxCents, p_actor: 'checkout'});
      const row = Array.isArray(held) ? held[0] : held;
      if (holdError || !row) return respond({error: giftCardError(holdError?.message), gift_card_error: true}, 409);
      giftCard = {id: row.out_card_id, cents: Math.round(Number(row.out_held) * 100)};
    }
    const giftCents = giftCard ? giftCard.cents : 0;
    const {data: order, error} = await supabase.from('shop_orders').insert({
      id: orderId,
      customer_name: customer.name.trim(), customer_email: customer.email.trim(), customer_phone: customer.phone.trim(),
      delivery_address: address, delivery_method, delivery_meta: deliveryMeta,
      items: trusted.items, subtotal: trusted.subtotalCents / 100, delivery_fee: feeCents / 100,
      discount_code: discount ? discount.code : null, discount_amount: discountCents / 100,
      gift_card_id: giftCard ? giftCard.id : null, gift_card_amount: giftCents / 100,
      total_amount: (beforeCardCents - giftCents) / 100, notes: instructions || null,
      payment_status: 'unpaid', status: 'pending', is_gift: false, gift_message: null,
    }).select('id, customer_token').single();
    if (error || !order) {
      if (giftCard) await supabase.rpc('gift_card_release', {p_order: orderId, p_note: 'Order could not be created'});
      return respond({error: 'Could not create order'}, 500);
    }
    return respond({order_id: order.id, order_ref: order.id, customer_token: order.customer_token});
  } catch (error) {
    if (error instanceof CartError) return respond({error: error.message}, 409);
    return respond({error: 'Could not prepare checkout. Please retry.'}, 503);
  }
});
