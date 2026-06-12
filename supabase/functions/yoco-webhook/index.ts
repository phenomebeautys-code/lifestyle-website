/**
 * yoco-webhook  (PhenomeBeauty shop)
 * Receives Yoco `payment.succeeded` events via Svix webhook delivery.
 * On success → marks shop_order as paid → fires pudo-create-shipment → fires send-order-email.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifyYocoSignature(
  payloadBytes: Uint8Array,
  svixSignature: string,
  svixTimestamp: string,
  secret: string,
): Promise<boolean> {
  try {
    const base64Secret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
    const keyBytes  = Uint8Array.from(atob(base64Secret), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const bodyText  = new TextDecoder().decode(payloadBytes);
    const toSign    = `${svixTimestamp}.${bodyText}`;
    const sigBytes  = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign));
    const computed  = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    const signatures = svixSignature.split(' ').map((s) => s.replace(/^v1,/, ''));
    return signatures.some((sig) => sig === computed);
  } catch (err) {
    console.error('verifyYocoSignature error:', err);
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
  req.headers.forEach((v, k) => { allHeaders[k] = v; });
  console.log('[yoco-webhook] headers:', JSON.stringify(allHeaders));

  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const { type, payload } = body;
  console.log('[yoco-webhook] event type:', type);

  const orderId    = payload?.metadata?.order_id ?? null;
  const checkoutId = payload?.id ?? payload?.checkoutId ?? null;
  console.log('[yoco-webhook] order_id:', orderId, '| checkoutId:', checkoutId);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const svixSig       = req.headers.get('svix-signature') ?? '';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
  const webhookSecret = Deno.env.get('YOCO_WEBHOOK_SECRET') ?? '';

  if (webhookSecret && svixSig) {
    const valid = await verifyYocoSignature(rawBytes, svixSig, svixTimestamp, webhookSecret);
    if (!valid) {
      console.error('[yoco-webhook] Signature verification failed');
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

  if (!orderId) {
    if (checkoutId) {
      const { data: found } = await supabase
        .from('shop_orders')
        .select('id, delivery_method, pudo_shipment_id, payment_status')
        .eq('yoco_checkout_id', checkoutId)
        .single();
      if (found) {
        return await processPayment(supabase, found.id, checkoutId, found);
      }
    }
    console.error('[yoco-webhook] No order_id in metadata and checkout lookup failed');
    return respond({ error: 'No order_id in metadata' }, 422);
  }

  const { data: order, error: fetchErr } = await supabase
    .from('shop_orders')
    .select('id, delivery_method, pudo_shipment_id, payment_status')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) {
    console.error('[yoco-webhook] Order not found:', orderId, fetchErr);
    return respond({ error: 'Order not found' }, 404);
  }

  return await processPayment(supabase, orderId, checkoutId, order);
});

async function processPayment(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  yocoCheckoutId: string | null,
  order: { id: string; delivery_method: string; pudo_shipment_id: string | null; payment_status: string },
) {
  if (order.payment_status === 'paid') {
    console.log('[yoco-webhook] Duplicate webhook — order already paid:', orderId);
    return respond({ received: true, already_paid: true }, 200);
  }

  const { data: updated, error: updateErr } = await supabase
    .from('shop_orders')
    .update({
      payment_status:   'paid',
      status:           'confirmed',
      yoco_checkout_id: yocoCheckoutId,
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

  console.log(`[yoco-webhook] Order ${orderId} marked as paid ✓`);

  const confirmedOrder = updated[0];
  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const internalHeaders = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'apikey':        serviceKey,
  };

  // ── Fire Pudo shipment ──────────────────────────────────────────────────────
  const shouldCreateShipment = (
    ['locker', 'door'].includes(confirmedOrder.delivery_method) &&
    !confirmedOrder.pudo_shipment_id
  );

  if (shouldCreateShipment) {
    try {
      console.log(`[yoco-webhook] Firing pudo-create-shipment for order ${orderId}`);
      const pudoRes  = await fetch(`${supabaseUrl}/functions/v1/pudo-create-shipment`, {
        method: 'POST', headers: internalHeaders,
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

  // ── Fire payment received email — non-fatal ──────────────────────────────
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-order-email`, {
      method: 'POST', headers: internalHeaders,
      body: JSON.stringify({ type: 'payment_received', order_id: orderId }),
    });
    console.log(`[yoco-webhook] send-order-email (payment_received) fired ✓`);
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
