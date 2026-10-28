import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyWebhook } from '../_shared/yoco-signature.mjs';

const respond = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type': 'application/json'},
});

Deno.serve(async req => {
  if (req.method !== 'POST') return respond({error: 'Method not allowed'}, 405);
  try {
    const raw = await req.text();
    if (!await verifyWebhook(raw, req.headers, Deno.env.get('YOCO_WEBHOOK_SECRET') || '')) {
      return respond({error: 'Invalid webhook signature'}, 401);
    }
    let event;
    try { event = JSON.parse(raw); } catch { return respond({error: 'Invalid JSON'}, 400); }
    if (!event || typeof event !== 'object') return respond({error: 'Invalid event'}, 400);
    if (event.type !== 'payment.succeeded') return respond({received: true, processed: false});
    const payload = event.payload;
    const paymentId = payload?.id;
    const orderId = payload?.metadata?.order_id;
    const eventCheckoutId = payload?.checkoutId || payload?.metadata?.checkoutId;
    if (typeof paymentId !== 'string' || !paymentId.startsWith('p_')) return respond({error: 'Invalid payment ID'}, 422);
    if (!orderId && !eventCheckoutId) return respond({error: 'Order association missing'}, 422);
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(url, key);
    let query = supabase.from('shop_orders').select('id, payment_status, total_amount, yoco_checkout_id, payment_id');
    query = orderId ? query.eq('id', orderId) : query.eq('yoco_checkout_id', eventCheckoutId);
    const {data: order, error: lookupError} = await query.maybeSingle();
    if (lookupError) return respond({error: 'Order lookup unavailable'}, 503);
    if (!order) return respond({error: 'Order not found'}, 404);
    const checkoutId = order.yoco_checkout_id;
    if (typeof checkoutId !== 'string' || !checkoutId.startsWith('ch_')) return respond({error: 'Stored checkout ID missing'}, 422);
    if (eventCheckoutId && eventCheckoutId !== checkoutId) return respond({error: 'Checkout association mismatch'}, 409);
    if (order.payment_status === 'paid') {
      if (order.payment_id !== paymentId) return respond({error: 'Payment association mismatch'}, 409);
      return respond({received: true, already_paid: true});
    }
    const secret = Deno.env.get('YOCO_SECRET_KEY');
    if (!secret) return respond({error: 'Payment verification unavailable'}, 503);
    const verification = await fetch(`https://payments.yoco.com/api/checkouts/${encodeURIComponent(checkoutId)}`, {
      headers: {Authorization: `Bearer ${secret}`, Accept: 'application/json'},
    });
    const checkout = await verification.json().catch(() => null);
    if (!verification.ok || !checkout) return respond({error: 'Payment verification unavailable'}, 503);
    if (checkout.id !== checkoutId || checkout.metadata?.order_id !== order.id) {
      return respond({error: 'Verified checkout association mismatch'}, 409);
    }
    if (checkout.paymentId && checkout.paymentId !== paymentId) return respond({error: 'Verified payment association mismatch'}, 409);
    if (!['completed', 'succeeded', 'paid'].includes(String(checkout.status).toLowerCase())) {
      return respond({error: 'Checkout is not completed'}, 409);
    }
    const expected = Math.round(Number(order.total_amount) * 100);
    const amount = Number(checkout.amount);
    if (!Number.isSafeInteger(expected) || expected <= 0 || !Number.isSafeInteger(amount) || amount !== expected) {
      return respond({error: 'Payment amount mismatch'}, 409);
    }
    // Missing currency is not evidence of ZAR. Fail closed instead of assuming it.
    if (String(checkout.currency || '').toUpperCase() !== 'ZAR') return respond({error: 'Payment currency mismatch'}, 409);
    const {data: changed, error: updateError} = await supabase.from('shop_orders').update({
      payment_status: 'paid', status: 'confirmed', payment_id: paymentId, paid_at: new Date().toISOString(),
    }).eq('id', order.id).eq('payment_status', 'unpaid').eq('yoco_checkout_id', checkoutId).select('id');
    if (updateError) return respond({error: 'Order update failed'}, 503);
    if (!changed?.length) return respond({received: true, processed: false, reason: 'order_changed_concurrently'});
    // Numeric stock, recipes and material deductions are intentionally deferred.
    // PUDO dispatch and the final delivered-status action remain owner-controlled.
    let notificationAccepted = false;
    try {
      const notification = await fetch(`${url}/functions/v1/send-order-email`, {
        method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key},
        body: JSON.stringify({type: 'payment_received', order_id: order.id}),
      });
      const result = await notification.json().catch(() => null);
      notificationAccepted = notification.ok && result?.ok === true;
    } catch { /* Email failure must not undo a verified payment. Durable retry is a separate rollout. */ }
    return respond({received: true, processed: true, order_id: order.id, notification_accepted: notificationAccepted});
  } catch {
    return respond({error: 'Payment processing unavailable'}, 503);
  }
});
