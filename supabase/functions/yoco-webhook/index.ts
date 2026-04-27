/**
 * yoco-webhook
 * Receives Yoco payment events via webhook.
 * On `payment.succeeded` → marks order as paid, then fires Pudo shipment creation.
 *
 * Register this URL in the Yoco dashboard:
 *   https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/yoco-webhook
 *
 * Env vars required:
 *   YOCO_WEBHOOK_SECRET   — from Yoco dashboard (used to verify signature)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  // Yoco sends POST only
  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  const rawBody = await req.text();

  // ── Verify Yoco webhook signature ──────────────────────────────────────────
  // Yoco signs with HMAC-SHA256. Header: X-Yoco-Signature
  const signature  = req.headers.get('X-Yoco-Signature') ?? '';
  const webhookSecret = Deno.env.get('YOCO_WEBHOOK_SECRET') ?? '';

  if (webhookSecret) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const expected = Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (signature !== expected) {
      console.warn('Yoco webhook signature mismatch');
      return respond({ error: 'Invalid signature' }, 401);
    }
  } else {
    console.warn('YOCO_WEBHOOK_SECRET not set — skipping signature verification');
  }

  // ── Parse event ────────────────────────────────────────────────────────────
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const eventType = event?.type ?? event?.event;
  console.log('Yoco webhook event:', eventType, JSON.stringify(event).slice(0, 200));

  // Only process successful payments
  if (eventType !== 'payment.succeeded' && eventType !== 'checkout.completed') {
    return respond({ received: true, processed: false, reason: 'Unhandled event type' }, 200);
  }

  // ── Extract order_id from metadata ─────────────────────────────────────────
  // Yoco nests metadata differently depending on event shape
  const metadata = event?.payload?.metadata
    ?? event?.data?.metadata
    ?? event?.metadata
    ?? {};

  const orderId = metadata?.order_id;

  if (!orderId) {
    console.error('No order_id in Yoco webhook metadata:', JSON.stringify(event));
    return respond({ error: 'No order_id in metadata' }, 422);
  }

  // ── Mark order as paid ─────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const yocoCheckoutId = event?.payload?.id ?? event?.data?.id ?? event?.id ?? null;

  const { data: order, error: updateErr } = await supabase
    .from('shop_orders')
    .update({
      payment_status:   'paid',
      status:           'confirmed',
      yoco_checkout_id: yocoCheckoutId,
    })
    .eq('id', orderId)
    .select('id, delivery_method, pudo_shipment_id')
    .single();

  if (updateErr || !order) {
    console.error('Failed to mark order as paid:', updateErr);
    return respond({ error: 'Order update failed' }, 500);
  }

  console.log(`Order ${orderId} marked as paid.`);

  // ── Fire Pudo shipment creation for locker orders ──────────────────────────
  if (order.delivery_method === 'locker' && !order.pudo_shipment_id) {
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
        console.error('Pudo shipment creation failed:', pudoBody);
      } else {
        console.log(`Pudo shipment created: tracking=${pudoBody.tracking_ref}`);
      }
    } catch (err) {
      // Non-fatal — order is paid, shipment can be retried manually
      console.error('Error calling pudo-create-shipment:', err);
    }
  }

  return respond({ received: true, processed: true, order_id: orderId }, 200);
});

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
