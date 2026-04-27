/**
 * pudo-create-shipment
 * Called after Yoco payment confirms (payment_status = 'paid').
 * Only fires for orders where delivery_method = 'locker'.
 *
 * POST body: { order_id: string }
 *
 * Uses the TCG Locker API (api-tcg.co.za) — Door to Locker (D2L)
 * delivery_address.terminal_id = customer's chosen locker (e.g. "CG63")
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
};

// Door to Locker Extra Small — per TCG Locker API docs
const SERVICE_LEVEL_CODE = 'D2LXS - ECO';

// PhenomeBeauty collection address (Cape Town)
const COLLECTION_ADDRESS = {
  type:            'business',
  company:         'PhenomeBeauty',
  street_address:  'Cape Town',
  local_area:      'Cape Town',
  suburb:          'Cape Town',
  city:            'Cape Town',
  code:            '8000',
  zone:            'WC',
  country:         'South Africa',
  entered_address: 'Cape Town, Western Cape, South Africa',
};

const COLLECTION_CONTACT = {
  name:          'PhenomeBeauty',
  email:         'hello@phenomebeauty.co.za',
  mobile_number: '+27745115725',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: { order_id?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { order_id } = body;
  if (!order_id) return json({ error: 'order_id is required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Fetch order ───────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from('shop_orders')
    .select('id, customer_name, customer_email, customer_phone, delivery_method, delivery_meta, items, pudo_shipment_id')
    .eq('id', order_id)
    .single();

  if (orderErr || !order) {
    console.error('Order fetch error:', orderErr);
    return json({ error: 'Order not found' }, 404);
  }
  if (order.delivery_method !== 'locker') {
    return json({ skipped: true, reason: 'Not a locker order' }, 200);
  }
  if (order.pudo_shipment_id) {
    return json({ skipped: true, reason: 'Shipment already created', pudo_shipment_id: order.pudo_shipment_id }, 200);
  }

  const meta = order.delivery_meta as {
    locker_id:      string;  // terminal_id e.g. "CG63"
    locker_name:    string;
    locker_address: string;
  };

  if (!meta?.locker_id) {
    return json({ error: 'delivery_meta.locker_id missing on order' }, 422);
  }

  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const parcelDescription = items.map((i: any) => `${i.name} x${i.qty}`).join(', ') || 'Beauty products';

  // ── Build D2L payload for TCG API ───────────────────────────────────────
  const payload = {
    service_level_code:  SERVICE_LEVEL_CODE,
    collection_address:  COLLECTION_ADDRESS,
    collection_contact:  COLLECTION_CONTACT,

    // terminal_id tells TCG which locker to deliver to
    delivery_address: {
      terminal_id: meta.locker_id,
    },
    delivery_contact: {
      name:          order.customer_name,
      email:         order.customer_email,
      mobile_number: (order.customer_phone ?? '').replace(/\s/g, ''),
    },

    parcels: [
      {
        submitted_length_cm:  17,
        submitted_width_cm:   8,
        submitted_height_cm:  8,
        submitted_weight_kg:  0.5,
        parcel_description:   parcelDescription,
        alternative_tracking_reference: '',
      },
    ],

    opt_in_rates:            [],
    opt_in_time_based_rates: [],
  };

  // ── Call TCG Locker API ─────────────────────────────────────────────────
  const pudoKey = Deno.env.get('PUDO_API_KEY') ?? '';
  console.log('[pudo-create-shipment] Creating D2L shipment for order:', order_id, '| locker:', meta.locker_id);

  let shipmentData: any;
  try {
    const res = await fetch('https://api-tcg.co.za/shipments', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${pudoKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log('[pudo-create-shipment] TCG response status:', res.status);
    console.log('[pudo-create-shipment] TCG response:', responseText.slice(0, 1000));

    if (!res.ok) {
      await supabase.from('shop_orders')
        .update({ pudo_error: `${res.status}: ${responseText}` })
        .eq('id', order_id);
      return json({ error: 'TCG API error', detail: responseText }, 502);
    }

    shipmentData = JSON.parse(responseText);
  } catch (err) {
    console.error('[pudo-create-shipment] Network error:', err);
    return json({ error: 'Network error calling TCG API' }, 502);
  }

  // ── Save tracking ref ─────────────────────────────────────────────────────
  const trackingRef = shipmentData?.custom_tracking_reference
    ?? shipmentData?.tracking_reference
    ?? shipmentData?.id
    ?? null;
  const shipmentId = shipmentData?.id ?? null;

  await supabase.from('shop_orders').update({
    pudo_shipment_id:  shipmentId,
    pudo_tracking_ref: trackingRef,
    pudo_error:        null,
  }).eq('id', order_id);

  console.log(`[pudo-create-shipment] ✓ Order ${order_id}: shipment=${shipmentId}, tracking=${trackingRef}`);

  return json({ success: true, shipment_id: shipmentId, tracking_ref: trackingRef }, 201);
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
