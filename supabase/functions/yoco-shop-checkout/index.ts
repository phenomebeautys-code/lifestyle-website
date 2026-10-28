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
    const {order_id, success_url, cancel_url} = body || {};
    if (typeof order_id !== 'string' || !order_id) return respond({error: 'Missing order_id'}, 400);
    let successUrl, cancelUrl;
    try { successUrl = new URL(success_url); cancelUrl = new URL(cancel_url); }
    catch { return respond({error: 'Invalid payment return URL'}, 400); }
    if ([successUrl, cancelUrl].some(url => !ORIGINS.includes(url.origin) || url.username || url.password)) {
      return respond({error: 'Payment return URLs must use the official PhenomeBeauty domain'}, 400);
    }
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(url, key);
    const {data: order, error: orderError} = await supabase.from('shop_orders')
      .select('id, customer_token, payment_status, status, items, delivery_method, delivery_fee, customer_email, yoco_checkout_id, subtotal, total_amount')
      .eq('id', order_id).single();
    if (orderError || !order) return respond({error: 'Order not found'}, 404);
    if (order.status !== 'pending' || order.payment_status !== 'unpaid') return respond({error: 'Order is not awaiting payment'}, 409);
    if (!order.customer_token) return respond({error: 'Customer order verification unavailable'}, 503);
    const ids = [...new Set((order.items || []).map(item => item.productId))];
    const {data: products, error: productError} = await supabase.from('products')
      .select('id, name, price, variants, sizes, image_url, active, availability').in('id', ids);
    if (productError || !products) return respond({error: 'Could not validate products'}, 503);
    const trusted = trustedCart(order.items, products);
    const quoteResponse = await fetch(`${url}/functions/v1/get-shipping-quote`, {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key},
      body: JSON.stringify({items: trusted.shippingItems}),
    });
    const quote = await quoteResponse.json().catch(() => null);
    if (!quoteResponse.ok || !quote || quote.error) return respond({error: 'Delivery quote unavailable'}, 503);
    if (!['door', 'locker'].includes(order.delivery_method)) return respond({error: 'Invalid delivery method'}, 409);
    const rawFee = order.delivery_method === 'locker' ? quote.locker_fee : quote.door_fee;
    const fee = Number(rawFee);
    if (quote.oversized || rawFee == null || !Number.isFinite(fee) || fee < 0) return respond({error: 'Standard delivery unavailable'}, 409);
    const feeCents = Math.round(fee * 100);
    const totalCents = trusted.subtotalCents + feeCents;
    // Do not silently reprice an existing order or mutate a checkout that may already be paid.
    if (Math.round(Number(order.subtotal) * 100) !== trusted.subtotalCents
      || Math.round(Number(order.delivery_fee) * 100) !== feeCents
      || Math.round(Number(order.total_amount) * 100) !== totalCents
      || order.items.some((item, index) => Number(item.price) !== trusted.items[index].price)) {
      return respond({error: 'Order prices or delivery rate changed. Please refresh your cart and create a new order.'}, 409);
    }
    const secret = Deno.env.get('YOCO_SECRET_KEY');
    if (!secret) return respond({error: 'Payment provider unavailable'}, 503);
    successUrl.searchParams.set('payment', 'success');
    successUrl.searchParams.set('order_id', order.id);
    successUrl.searchParams.set('ct', order.customer_token);
    const providerResponse = await fetch('https://payments.yoco.com/api/checkouts', {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${secret}`},
      body: JSON.stringify({amount: totalCents, currency: 'ZAR', cancelUrl: cancelUrl.toString(),
        successUrl: successUrl.toString(), metadata: {order_id: order.id, customer_email: order.customer_email}}),
    });
    const checkout = await providerResponse.json().catch(() => null);
    const redirectUrl = checkout?.redirectUrl ?? checkout?.url;
    if (!providerResponse.ok || typeof checkout?.id !== 'string' || !checkout.id.startsWith('ch_') || !redirectUrl) {
      return respond({error: 'Payment provider error. Please retry.'}, 502);
    }
    const {data: saved, error: saveError} = await supabase.from('shop_orders')
      .update({yoco_checkout_id: checkout.id}).eq('id', order.id).eq('status', 'pending').eq('payment_status', 'unpaid')
      .select('id').maybeSingle();
    if (saveError || !saved) return respond({error: 'Could not save payment checkout. Do not pay; contact the shop.'}, 503);
    return respond({redirectUrl});
  } catch (error) {
    if (error instanceof CartError) return respond({error: error.message}, 409);
    return respond({error: 'Could not prepare payment. Please retry.'}, 503);
  }
});
