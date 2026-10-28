import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CartError, trustedCart } from '../_shared/trusted-cart.mjs';

const ORIGINS = ['https://www.phenomebeauty.co.za', 'https://phenomebeauty.co.za'];
Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const headers = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
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
    const feeCents = Math.round(fee * 100);
    if (body.delivery_fee != null && (!Number.isFinite(Number(body.delivery_fee)) || Math.round(Number(body.delivery_fee) * 100) !== feeCents)) {
      return respond({error: 'Delivery rate changed. Refresh your delivery selection before paying.'}, 409);
    }
    const instructions = typeof body.special_instructions === 'string' ? body.special_instructions : '';
    const deliveryMeta = delivery_method === 'door'
      ? {...delivery_address, special_instructions: instructions}
      : {locker_id, locker_name, locker_address, special_instructions: instructions};
    const {data: order, error} = await supabase.from('shop_orders').insert({
      customer_name: customer.name.trim(), customer_email: customer.email.trim(), customer_phone: customer.phone.trim(),
      delivery_address: address, delivery_method, delivery_meta: deliveryMeta,
      items: trusted.items, subtotal: trusted.subtotalCents / 100, delivery_fee: feeCents / 100,
      total_amount: (trusted.subtotalCents + feeCents) / 100, notes: instructions || null,
      payment_status: 'unpaid', status: 'pending', is_gift: false, gift_message: null,
    }).select('id, customer_token').single();
    if (error || !order) return respond({error: 'Could not create order'}, 500);
    return respond({order_id: order.id, order_ref: order.id, customer_token: order.customer_token});
  } catch (error) {
    if (error instanceof CartError) return respond({error: error.message}, 409);
    return respond({error: 'Could not prepare checkout. Please retry.'}, 503);
  }
});
