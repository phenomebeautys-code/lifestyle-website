/**
 * yoco-webhook  (PhenomeBeauty shop)
 * Receives Yoco `payment.succeeded` events via Svix webhook delivery.
 * On success → marks shop_order as paid → fires pudo-create-shipment → fires send-order-email.
 *
 * Fix (2026-07-06): payload.id is always the payment ID (p_...). The checkout
 * session ID (ch_...) lives in payload.checkoutId. Previous code used
 * `payload?.id ?? payload?.checkoutId` which meant checkoutId was never reached.
 * Now we extract both and try the DB lookup against each.
 *
 * Fix (2026-07-21): Svix HMAC signed string must be `${svix-id}.${svix-timestamp}.${body}`.
 * Previous implementation omitted svix-id, causing all signature verifications to
 * return 401 and orders to never be marked as paid.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Verify a Yoco / Svix webhook signature.
 *
 * Yoco's observed webhook headers are webhook-id, webhook-signature, and
 * webhook-timestamp. The svix-* aliases are retained for compatibility.
 * The signed message is `${webhook-id}.${webhook-timestamp}.${raw-body}`.
 */
async function verifyYocoSignature(
  payloadBytes: Uint8Array,
  webhookId: string,
  webhookSignature: string,
  webhookTimestamp: string,
  secret: string,
): Promise<boolean> {
  try {
    const base64Secret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
    const keyBytes = Uint8Array.from(atob(base64Secret), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const bodyText = new TextDecoder().decode(payloadBytes);
    const toSign = `${webhookId}.${webhookTimestamp}.${bodyText}`;
    const sigBytes = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      new TextEncoder().encode(toSign),
    );
    const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

    const signatures = webhookSignature
      .split(' ')
      .map((signature) => signature.replace(/^v1,/, ''));

    return signatures.some((signature) => signature === computed);
  } catch (err) {
    console.error('[yoco-webhook] verifyYocoSignature error:', err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  const rawBytes = new Uint8Array(await req.arrayBuffer());
  const bodyText = new TextDecoder().decode(rawBytes);

  const allHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });
  console.log('[yoco-webhook] headers:', JSON.stringify(allHeaders));

  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const { type, payload } = body;
  console.log('[yoco-webhook] event type:', type);
  console.log('[yoco-webhook] full payload:', JSON.stringify(payload));

  // payload.id → payment ID (p_...)
  // payload.checkoutId or payload.metadata.checkoutId → checkout session ID (ch_...)
  const orderId = payload?.metadata?.order_id ?? null;
  const paymentId = payload?.id ?? null;
  const checkoutId = payload?.checkoutId ?? payload?.metadata?.checkoutId ?? null;

  console.log(
    '[yoco-webhook] order_id:',
    orderId,
    '| paymentId:',
    paymentId,
    '| checkoutId:',
    checkoutId,
  );

  const webhookId =
    req.headers.get('webhook-id') ??
    req.headers.get('svix-id') ??
    '';
  const webhookSignature =
    req.headers.get('webhook-signature') ??
    req.headers.get('svix-signature') ??
    '';
  const webhookTimestamp =
    req.headers.get('webhook-timestamp') ??
    req.headers.get('svix-timestamp') ??
    '';
  const webhookSecret = Deno.env.get('YOCO_WEBHOOK_SECRET') ?? '';

  console.log(
    '[yoco-webhook] webhook-id:',
    webhookId,
    '| webhook-timestamp:',
    webhookTimestamp,
  );

  if (webhookSecret && webhookSignature) {
    const valid = await verifyYocoSignature(
      rawBytes,
      webhookId,
      webhookSignature,
      webhookTimestamp,
      webhookSecret,
    );

    if (!valid) {
      console.error(
        '[yoco-webhook] Signature verification FAILED — webhook-id:',
        webhookId,
      );
      return respond({ error: 'Invalid signature' }, 401);
    }

    console.log('[yoco-webhook] Signature verified ✓');
  } else {
    console.warn('[yoco-webhook] No signature header or secret — skipping verification');
  }

  if (type !== 'payment.succeeded') {
    console.log('[yoco-webhook] Ignoring event type:', type);
    return respond({ received: true, processed: false }, 200);
  }

  if (!paymentId) {
    console.error('[yoco-webhook] payment.succeeded event has no payment ID');
    return respond({ error: 'Payment ID missing' }, 422);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Primary path: order_id in metadata.
  if (orderId) {
    const { data: order, error: fetchErr } = await supabase
      .from('shop_orders')
      .select('id, delivery_method, pudo_shipment_id, payment_status')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      console.error('[yoco-webhook] Order not found by order_id:', orderId, fetchErr);
      return respond({ error: 'Order not found' }, 404);
    }

    return await processPayment(supabase, orderId, paymentId, checkoutId, order);
  }

  // Fallback path: match by checkout ID, then payment ID.
  console.warn('[yoco-webhook] No order_id in metadata — falling back to ID lookup');

  if (checkoutId) {
    const { data: found } = await supabase
      .from('shop_orders')
      .select('id, delivery_method, pudo_shipment_id, payment_status')
      .eq('yoco_checkout_id', checkoutId)
      .maybeSingle();

    if (found) {
      console.log('[yoco-webhook] Order found by checkoutId (ch_...):', found.id);
      return await processPayment(supabase, found.id, paymentId, checkoutId, found);
    }
  }

  if (paymentId && paymentId !== checkoutId) {
    const { data: found } = await supabase
      .from('shop_orders')
      .select('id, delivery_method, pudo_shipment_id, payment_status')
      .eq('yoco_checkout_id', paymentId)
      .maybeSingle();

    if (found) {
      console.log('[yoco-webhook] Order found by paymentId (p_...):', found.id);
      return await processPayment(supabase, found.id, paymentId, checkoutId, found);
    }
  }

  console.error(
    '[yoco-webhook] Could not match order — checkoutId:',
    checkoutId,
    'paymentId:',
    paymentId,
  );
  return respond({ error: 'Order not found' }, 422);
});

async function processPayment(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  paymentId: string,
  checkoutId: string | null,
  order: {
    id: string;
    delivery_method: string;
    pudo_shipment_id: string | null;
    payment_status: string;
  },
) {
  if (order.payment_status === 'paid') {
    console.log('[yoco-webhook] Duplicate webhook — order already paid:', orderId);
    return respond({ received: true, already_paid: true }, 200);
  }

  const { data: updated, error: updateErr } = await supabase
    .from('shop_orders')
    .update({
      payment_status: 'paid',
      status: 'confirmed',
      // Preserve the checkout ID already stored; write the payment ID separately.
      yoco_checkout_id: checkoutId ?? order.id,
      payment_id: paymentId,
      paid_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('payment_status', 'unpaid')
    .select('id, delivery_method, pudo_shipment_id');

  if (updateErr) {
    console.error('[yoco-webhook] Update error:', updateErr);
    return respond({ error: 'Order update failed' }, 500);
  }

  if (!updated || updated.length === 0) {
    console.log('[yoco-webhook] Duplicate — already processed (race condition guard):', orderId);
    return respond({ received: true, already_paid: true }, 200);
  }

  console.log(`[yoco-webhook] Order ${orderId} marked as paid ✓ | payment_id: ${paymentId}`);

  const confirmedOrder = updated[0];
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const internalHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
  };

  const shouldCreateShipment = (
    ['locker', 'door'].includes(confirmedOrder.delivery_method) &&
    !confirmedOrder.pudo_shipment_id
  );

  if (shouldCreateShipment) {
    try {
      console.log(`[yoco-webhook] Firing pudo-create-shipment for order ${orderId}`);
      const pudoRes = await fetch(`${supabaseUrl}/functions/v1/pudo-create-shipment`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({ order_id: orderId }),
      });
      const pudoBody = await pudoRes.json();

      if (!pudoRes.ok) {
        console.error('[yoco-webhook] pudo-create-shipment failed:', pudoBody);
      } else {
        console.log(`[yoco-webhook] Pudo shipment created ✓ | tracking=${pudoBody.tracking_ref}`);
      }
    } catch (err) {
      console.error('[yoco-webhook] Error calling pudo-create-shipment:', err);
    }
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-order-email`, {
      method: 'POST',
      headers: internalHeaders,
      body: JSON.stringify({ type: 'payment_received', order_id: orderId }),
    });
    console.log('[yoco-webhook] send-order-email (payment_received) fired ✓');
  } catch (emailErr) {
    console.error('[yoco-webhook] send-order-email failed (non-fatal):', emailErr);
  }

  return respond({ received: true, processed: true, order_id: orderId }, 200);
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
