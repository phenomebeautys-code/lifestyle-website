/**
 * yoco-webhook  (PhenomeBeauty shop)
 * Receives Yoco `payment.succeeded` events via Svix webhook delivery.
 * On success → marks shop_order as paid → fires pudo-create-shipment for locker orders.
 *
 * Register in Yoco dashboard:
 *   https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/yoco-webhook
 *
 * Env vars required (Supabase Edge Function secrets):
 *   YOCO_WEBHOOK_SECRET        — whsec_... value from Yoco dashboard
 *   SUPABASE_URL               — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY  — injected automatically
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Svix signature verification ───────────────────────────────────────────────
// Yoco delivers webhooks via Svix. Signing string: "{svix-timestamp}.{rawBody}"
// Secret is base64-encoded after stripping the "whsec_" prefix.
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

    // svix-signature header format: "v1,<base64> v1,<base64> ..."
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

  // Read raw bytes (needed for signature verification)
  const rawBytes   = new Uint8Array(await req.arrayBuffer());
  const bodyText   = new TextDecoder().decode(rawBytes);

  // Log all headers in dev for debugging
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((v, k) => { allHeaders[k] = v; });
  console.log('[yoco-webhook] headers:', JSON.stringify(allHeaders));

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const { type, payload } = body;
  console.log('[yoco-webhook] event type:', type);

  // ── Resolve order_id from metadata ──────────────────────────────────────────
  // Yoco puts our metadata under payload.metadata
  const orderId     = payload?.metadata?.order_id   ?? null;
  const checkoutId  = payload?.id ?? payload?.checkoutId ?? null;

  console.log('[yoco-webhook] order_id:', orderId, '| checkoutId:', checkoutId);

  // ── Supabase client ──────────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Verify Svix signature ────────────────────────────────────────────────────
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

  // ── Ignore non-payment events ────────────────────────────────────────────────
  if (type !== 'payment.succeeded') {
    console.log('[yoco-webhook] Ignoring event type:', type);
    return respond({ received: true, processed: false }, 200);
  }

  // ── Require order_id ────────────────────────────────────────────────────────
  if (!orderId) {
    // Fallback: try to find order by yoco_checkout_id
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

  // ── Fetch current order state ────────────────────────────────────────────────
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

// ── Core payment processing ───────────────────────────────────────────────────
async function processPayment(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  yocoCheckoutId: string | null,
  order: { id: string; delivery_method: string; pudo_shipment_id: string | null; payment_status: string },
) {
  // ── Duplicate guard ──────────────────────────────────────────────────────────
  if (order.payment_status === 'paid') {
    console.log('[yoco-webhook] Duplicate webhook — order already paid:', orderId);
    return respond({ received: true, already_paid: true }, 200);
  }

  // ── Mark as paid (atomic: only updates if still unpaid) ─────────────────────
  const { data: updated, error: updateErr } = await supabase
    .from('shop_orders')
    .update({
      payment_status:   'paid',
      status:           'confirmed',
      yoco_checkout_id: yocoCheckoutId,
    })
    .eq('id', orderId)
    .eq('payment_status', 'unpaid')   // atomic duplicate guard
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

  // ── Fire Pudo shipment creation for locker orders ────────────────────────────
  const confirmedOrder = updated[0];
  if (confirmedOrder.delivery_method === 'locker' && !confirmedOrder.pudo_shipment_id) {
    try {
      const pudoRes = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/pudo-create-shipment`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'apikey':        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          },
          body: JSON.stringify({ order_id: orderId }),
        },
      );
      const pudoBody = await pudoRes.json();
      if (!pudoRes.ok) {
        console.error('[yoco-webhook] Pudo shipment creation failed:', pudoBody);
      } else {
        console.log(`[yoco-webhook] Pudo shipment created: tracking=${pudoBody.tracking_ref}`);
      }
    } catch (err) {
      // Non-fatal — order is paid, shipment can be retried manually from admin
      console.error('[yoco-webhook] Error calling pudo-create-shipment:', err);
    }
  }

  return respond({ received: true, processed: true, order_id: orderId }, 200);
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
