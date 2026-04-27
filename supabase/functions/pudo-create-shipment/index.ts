/**
 * pudo-create-shipment
 * Called internally after Yoco payment confirms (payment_status = 'paid').
 * Only fires for orders where delivery_method = 'locker'.
 *
 * POST body: { order_id: string }
 *
 * Docs: https://thecourierguy.co.za/wp-content/uploads/2025/08/The-Courier-Guy-Locker-API-docs.pdf
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
};

// Locker-to-Locker ECO service level code per TCG Locker API docs
const SERVICE_LEVEL_CODE = 'KIOSK';

// Generic collection point ID — PhenomeBeauty drops at any Pudo locker
const COLLECTION_POINT_ID = 'CG0000';
const COLLECTION_POINT_PROVIDER = 'tcg-locker';
const DELIVERY_POINT_PROVIDER   = 'tcg-locker';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { order_id } = body;
  if (!order_id) return json({ error: 'order_id is required' }, 400);

  // ── Supabase admin client (service role for reading full order) ──────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Fetch order ──────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from('shop_orders')
    .select('id, customer_name, customer_email, customer_phone, delivery_method, delivery_meta, items, total_amount, pudo_shipment_id')
    .eq('id', order_id)
    .single();

  if (orderErr || !order) {
    console.error('Order fetch error:', orderErr);
    return json({ error: 'Order not found' }, 404);
  }

  // ── Guard: only locker orders ────────────────────────────────────────────
  if (order.delivery_method !== 'locker') {
    return json({ skipped: true, reason: 'Not a locker order' }, 200);
  }

  // ── Guard: already created ───────────────────────────────────────────────
  if (order.pudo_shipment_id) {
    return json({ skipped: true, reason: 'Shipment already created', pudo_shipment_id: order.pudo_shipment_id }, 200);
  }

  const meta = order.delivery_meta as {
    locker_id: string;
    locker_name: string;
    locker_address: string;
  };

  if (!meta?.locker_id) {
    return json({ error: 'delivery_meta.locker_id is missing on this order' }, 422);
  }

  // ── Build parcel description from items ──────────────────────────────────
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const parcelDescription = items.map((i: any) => `${i.name} x${i.qty}`).join(', ') || 'Beauty products';

  // ── Build Shiplogic shipment payload ─────────────────────────────────────
  // Per TCG Locker API docs — Locker to Locker
  const payload = {
    service_level_code: SERVICE_LEVEL_CODE,
    special_instructions: '',
    customer_reference: order.id,

    // Sender (PhenomeBeauty drops at any Pudo locker)
    collection_address: {
      type:                   'business',
      company:                'PhenomeBeauty',
      street_address:         'Cape Town',  // Required field — actual drop-off is determined by the locker
      local_area:             'Cape Town',
      city:                   'Cape Town',
      code:                   '8000',
      country_code:           'ZA',
    },
    collection_contact: {
      name:  'PhenomeBeauty',
      email: 'hello@phenomebeauty.co.za',
      mobile_number: '+27745115725',
    },
    collection_pickup_point_id:       COLLECTION_POINT_ID,
    collection_pickup_point_provider: COLLECTION_POINT_PROVIDER,

    // Recipient (customer's chosen locker)
    delivery_address: {
      type:         'residential',
      street_address: meta.locker_address,
      local_area:     '',
      city:           'Cape Town',
      code:           '8000',
      country_code:   'ZA',
    },
    delivery_contact: {
      name:          order.customer_name,
      email:         order.customer_email,
      mobile_number: order.customer_phone?.replace(/\s/g, '') || '',
    },
    delivery_pickup_point_id:       meta.locker_id,
    delivery_pickup_point_provider: DELIVERY_POINT_PROVIDER,

    // Parcel — default to XS (typical beauty product, ≤2kg)
    parcels: [
      {
        submitted_length_cm: 17,
        submitted_width_cm:  8,
        submitted_height_cm: 8,
        submitted_weight_kg: 0.5,
        description:         parcelDescription,
      },
    ],
  };

  // ── Call Shiplogic API ────────────────────────────────────────────────────
  const pudoKey = Deno.env.get('PUDO_API_KEY')!;

  let shipmentData: any;
  try {
    const res = await fetch('https://api.shiplogic.com/shipments', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${pudoKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();

    if (!res.ok) {
      console.error('Shiplogic create shipment error:', res.status, responseText);
      // Save the error so it can be retried manually from the admin dashboard
      await supabase.from('shop_orders').update({
        pudo_error: `${res.status}: ${responseText}`,
      }).eq('id', order_id);
      return json({ error: 'Shiplogic API error', detail: responseText }, 502);
    }

    shipmentData = JSON.parse(responseText);
  } catch (err) {
    console.error('Network error calling Shiplogic:', err);
    return json({ error: 'Network error calling Shiplogic' }, 502);
  }

  // ── Save tracking reference back to the order ────────────────────────────
  const trackingRef = shipmentData?.tracking_reference
    || shipmentData?.short_tracking_reference
    || shipmentData?.id
    || null;

  const shipmentId = shipmentData?.id || null;

  const { error: updateErr } = await supabase.from('shop_orders').update({
    pudo_shipment_id:    shipmentId,
    pudo_tracking_ref:   trackingRef,
    pudo_error:          null,
  }).eq('id', order_id);

  if (updateErr) {
    console.error('Failed to save tracking ref to order:', updateErr);
  }

  console.log(`Pudo shipment created for order ${order_id}: shipment=${shipmentId}, tracking=${trackingRef}`);

  return json({
    success:       true,
    shipment_id:   shipmentId,
    tracking_ref:  trackingRef,
  }, 201);
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
