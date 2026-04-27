/**
 * pudo-create-shipment
 * Called after Yoco payment confirms (payment_status = 'paid').
 * Handles BOTH delivery methods:
 *
 *   delivery_method = 'locker'  →  Locker to Locker (L2L)
 *     collection_address: { terminal_id: "CG0000" }  ← PhenomeBeauty drops at any locker
 *     delivery_address:   { terminal_id: "CG341"  }  ← customer's chosen locker
 *     service_level_code: "L2LXS - ECO"
 *
 *   delivery_method = 'door'    →  Locker to Door (L2D)
 *     collection_address: { terminal_id: "CG0000" }  ← same drop-off model
 *     delivery_address:   { full street address }     ← customer's home/work
 *     service_level_code: "L2DXS - ECO"
 *
 * PhenomeBeauty NEVER needs collection — they walk to a locker and drop off.
 * CG0000 is the generic "any locker" terminal_id accepted by TCG.
 *
 * API: POST https://api-tcg.co.za/shipments
 * Auth: Bearer <PUDO_API_KEY>  (same key used in pudo-locker-search)
 *
 * POST body: { order_id: string }
 *
 * Env vars:
 *   PUDO_API_KEY               — Pudo/TCG API key
 *   SUPABASE_URL               — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY  — injected automatically
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS — identical pattern to pudo-locker-search ────────────────────────────
const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

// ── PhenomeBeauty sender details ──────────────────────────────────────────────
// CG0000 = generic TCG locker drop-off terminal ("drop at any locker")
const PHENOME_LOCKER_TERMINAL = 'CG0000';

const COLLECTION_CONTACT = {
  name:          'PhenomeBeauty',
  email:         'hello@phenomebeauty.co.za',
  mobile_number: '+27745115725',
};

// ── Service level codes (XS box: 60×17×8cm, max 2kg — covers all products) ───
const SVC_L2L = 'L2LXS - ECO';  // Locker to Locker Extra Small
const SVC_L2D = 'L2DXS - ECO';  // Locker to Door Extra Small

// ── Parcel spec for all PhenomeBeauty products ────────────────────────────────
function buildParcel(description: string) {
  return [{
    submitted_length_cm:  60,
    submitted_width_cm:   17,
    submitted_height_cm:  8,
    submitted_weight_kg:  1,
    parcel_description:   description,
    alternative_tracking_reference: '',
  }];
}

Deno.serve(async (req: Request) => {
  const origin        = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const corsHeaders   = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
    'Access-Control-Max-Age':       '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  let body: { order_id?: string };
  try { body = await req.json(); }
  catch { return respond({ error: 'Invalid JSON body' }, 400, corsHeaders); }

  const { order_id } = body;
  if (!order_id) return respond({ error: 'order_id is required' }, 400, corsHeaders);

  // ── Supabase client ───────────────────────────────────────────────────────
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
    console.error('[pudo-create-shipment] Order fetch error:', orderErr);
    return respond({ error: 'Order not found' }, 404, corsHeaders);
  }

  // Guard: only handle locker or door
  if (!['locker', 'door'].includes(order.delivery_method)) {
    return respond({ skipped: true, reason: `Unknown delivery_method: ${order.delivery_method}` }, 200, corsHeaders);
  }

  // Guard: idempotency — don't create duplicate shipments
  if (order.pudo_shipment_id) {
    console.log('[pudo-create-shipment] Shipment already exists:', order.pudo_shipment_id);
    return respond({ skipped: true, reason: 'Shipment already created', pudo_shipment_id: order.pudo_shipment_id }, 200, corsHeaders);
  }

  const meta  = (order.delivery_meta ?? {}) as Record<string, string>;
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const parcelDesc   = items.map((i: any) => `${i.name} x${i.qty}`).join(', ') || 'Beauty products';
  const phone        = (order.customer_phone ?? '').replace(/\s/g, '');

  // ── Build payload based on delivery method ────────────────────────────────
  let payload: Record<string, unknown>;

  if (order.delivery_method === 'locker') {
    // ── L2L: Locker → Locker ──────────────────────────────────────────────
    if (!meta.locker_id) {
      return respond({ error: 'delivery_meta.locker_id missing' }, 422, corsHeaders);
    }
    console.log(`[pudo-create-shipment] Building L2L payload | order=${order_id} | dest=${meta.locker_id}`);

    payload = {
      service_level_code:  SVC_L2L,
      collection_address:  { terminal_id: PHENOME_LOCKER_TERMINAL },
      collection_contact:  COLLECTION_CONTACT,
      delivery_address:    { terminal_id: meta.locker_id },
      delivery_contact: {
        name:          order.customer_name,
        email:         order.customer_email,
        mobile_number: phone,
      },
      parcels:                  buildParcel(parcelDesc),
      opt_in_rates:             [],
      opt_in_time_based_rates:  [],
    };

  } else {
    // ── L2D: Locker → Door ────────────────────────────────────────────────
    // delivery_meta from checkout: { type, street, suburb, city, postal, province }
    if (!meta.street || !meta.city) {
      return respond({ error: 'delivery_meta missing street/city for door delivery' }, 422, corsHeaders);
    }

    // Map province name to TCG zone code
    const ZONE_MAP: Record<string, string> = {
      'Western Cape':   'WC',
      'Eastern Cape':   'EC',
      'Northern Cape':  'NC',
      'Gauteng':        'GP',
      'KwaZulu-Natal':  'KZN',
      'Free State':     'FS',
      'Limpopo':        'LP',
      'Mpumalanga':     'MP',
      'North West':     'NW',
    };
    const zone = ZONE_MAP[meta.province ?? ''] ?? 'WC';
    const enteredAddress = `${meta.street}, ${meta.suburb}, ${meta.city}, ${meta.postal}, South Africa`;

    console.log(`[pudo-create-shipment] Building L2D payload | order=${order_id} | dest=${enteredAddress}`);

    payload = {
      service_level_code:  SVC_L2D,
      collection_address:  { terminal_id: PHENOME_LOCKER_TERMINAL },
      collection_contact:  COLLECTION_CONTACT,
      delivery_address: {
        type:            'residential',
        street_address:  meta.street,
        local_area:      meta.suburb,
        suburb:          meta.suburb,
        city:            meta.city,
        code:            meta.postal,
        zone:            zone,
        country:         'South Africa',
        entered_address: enteredAddress,
      },
      delivery_contact: {
        name:          order.customer_name,
        email:         order.customer_email,
        mobile_number: phone,
      },
      parcels:                  buildParcel(parcelDesc),
      opt_in_rates:             [],
      opt_in_time_based_rates:  [],
    };
  }

  // ── Call TCG API ──────────────────────────────────────────────────────────
  const pudoKey = Deno.env.get('PUDO_API_KEY') ?? '';
  if (!pudoKey) {
    return respond({ error: 'PUDO_API_KEY not configured' }, 500, corsHeaders);
  }

  let shipmentData: any;
  try {
    const res = await fetch('https://api-tcg.co.za/shipments', {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${pudoKey}`,
        'Accept':         'application/json',
        'Content-Type':   'application/json',
        'requested-from': 'portal',  // required header — confirmed working in pudo-locker-search
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log(`[pudo-create-shipment] TCG status: ${res.status}`);
    console.log(`[pudo-create-shipment] TCG response (first 800): ${responseText.slice(0, 800)}`);

    if (!res.ok) {
      // Save the error to the order so admin can see it
      await supabase.from('shop_orders')
        .update({ pudo_error: `${res.status}: ${responseText.slice(0, 500)}` })
        .eq('id', order_id);
      return respond({ error: 'TCG API error', status: res.status, detail: responseText.slice(0, 500) }, 502, corsHeaders);
    }

    try {
      shipmentData = JSON.parse(responseText);
    } catch {
      return respond({ error: 'Invalid JSON from TCG API', raw: responseText.slice(0, 300) }, 502, corsHeaders);
    }

  } catch (err) {
    console.error('[pudo-create-shipment] Network error:', err);
    return respond({ error: 'Network error calling TCG API', detail: String(err) }, 502, corsHeaders);
  }

  // ── Extract tracking info from response ───────────────────────────────────
  // TCG returns: id (numeric), custom_tracking_reference (e.g. "TCGD000501")
  const shipmentId  = shipmentData?.id                        ?? null;
  const trackingRef = shipmentData?.custom_tracking_reference
                   ?? shipmentData?.tracking_reference
                   ?? String(shipmentId)
                   ?? null;

  // ── Persist to order ──────────────────────────────────────────────────────
  await supabase.from('shop_orders').update({
    pudo_shipment_id:  String(shipmentId),
    pudo_tracking_ref: trackingRef,
    pudo_error:        null,
  }).eq('id', order_id);

  console.log(`[pudo-create-shipment] ✓ Order ${order_id} | method=${order.delivery_method} | shipment=${shipmentId} | tracking=${trackingRef}`);

  return respond({
    success:       true,
    delivery_type: order.delivery_method === 'locker' ? 'L2L' : 'L2D',
    shipment_id:   shipmentId,
    tracking_ref:  trackingRef,
  }, 201, corsHeaders);
});

// ── Shared respond helper — same pattern as pudo-locker-search ────────────────
function respond(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
