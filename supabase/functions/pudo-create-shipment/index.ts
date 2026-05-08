/**
 * pudo-create-shipment
 * ─────────────────────────────────────────────────────────────────────────────
 * Called after Yoco payment confirms (payment_status = 'paid').
 * Handles BOTH delivery methods:
 *
 *   delivery_method = 'locker'  →  Locker to Locker (L2L)
 *     collection_address: { terminal_id: "CG0000" }  ← PhenomeBeauty drops at any locker
 *     delivery_address:   { terminal_id: <chosen> }  ← customer's chosen locker
 *     service_level_code: determined by packaging engine (e.g. "L2LXS - ECO")
 *
 *   delivery_method = 'door'    →  Locker to Door (L2D)
 *     collection_address: { terminal_id: "CG0000" }  ← same drop-off model
 *     delivery_address:   { full street address }     ← customer's home/work
 *     service_level_code: determined by packaging engine (e.g. "L2DXS - ECO")
 *
 * PHASE 2 CHANGE: Replaced hardcoded XS box + 60×17×8cm / 1kg parcel spec
 * with the packaging engine — box size is now calculated from actual cart items.
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

import { createClient }  from 'https://esm.sh/@supabase/supabase-js@2';
import { determineBox, type CartItem, type ProductDimensions } from '../_shared/packaging-engine.ts';

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

// ── PhenomeBeauty sender details ──────────────────────────────────────────────
const PHENOME_LOCKER_TERMINAL = 'CG0000';

const COLLECTION_CONTACT = {
  name:          'PhenomeBeauty',
  email:         'hello@phenomebeauty.co.za',
  mobile_number: '+27745115725',
};

// ── Province → TCG zone code map ──────────────────────────────────────────────
const ZONE_MAP: Record<string, string> = {
  'Western Cape':  'WC',
  'Eastern Cape':  'EC',
  'Northern Cape': 'NC',
  'Gauteng':       'GP',
  'KwaZulu-Natal': 'KZN',
  'Free State':    'FS',
  'Limpopo':       'LP',
  'Mpumalanga':    'MP',
  'North West':    'NW',
};

Deno.serve(async (req: Request) => {
  const origin        = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const corsHeaders   = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
    'Access-Control-Max-Age':       '86400',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST')   return respond({ error: 'Method not allowed' }, 405, corsHeaders);

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

  if (!['locker', 'door'].includes(order.delivery_method)) {
    return respond({ skipped: true, reason: `Unknown delivery_method: ${order.delivery_method}` }, 200, corsHeaders);
  }

  // Idempotency guard — never create duplicate shipments
  if (order.pudo_shipment_id) {
    console.log('[pudo-create-shipment] Shipment already exists:', order.pudo_shipment_id);
    return respond({ skipped: true, reason: 'Shipment already created', pudo_shipment_id: order.pudo_shipment_id }, 200, corsHeaders);
  }

  const meta       = (order.delivery_meta ?? {}) as Record<string, string>;
  const orderItems: any[] = Array.isArray(order.items) ? order.items : [];
  const parcelDesc = orderItems.map((i: any) => `${i.name} x${i.qty}`).join(', ') || 'Beauty products';
  const phone      = (order.customer_phone ?? '').replace(/\s/g, '');

  // ── Packaging engine — determine correct box size from order items ─────────
  // order.items stores { productId (or id), qty, name, price }
  const cartItems: CartItem[] = orderItems.map((i: any) => ({
    productId: i.productId ?? i.id,
    qty:       Number(i.qty) || 1,
  }));

  const productIds = [...new Set(cartItems.map(i => i.productId))];
  const { data: products, error: prodErr } = await supabase
    .from('shop_products')
    .select('id, weight_kg, length_cm, width_cm, height_cm, pack_flat')
    .in('id', productIds);

  let serviceLevelCode: string;
  let parcelWeight:     number;
  let parcelL:          number;
  let parcelW:          number;
  let parcelH:          number;

  if (prodErr || !products?.length) {
    // Fallback to previous XS spec — avoids blocking a paid order if dimensions are missing
    console.warn('[pudo-create-shipment] Could not fetch product dimensions, using XS fallback');
    serviceLevelCode = order.delivery_method === 'locker' ? 'L2LXS - ECO' : 'L2DXS - ECO';
    parcelWeight     = 1;
    parcelL          = 60;
    parcelW          = 17;
    parcelH          = 8;
  } else {
    const dimensions: ProductDimensions[] = products.map((p: any) => ({
      id:        p.id,
      weight_kg: Number(p.weight_kg),
      length_cm: Number(p.length_cm),
      width_cm:  Number(p.width_cm),
      height_cm: Number(p.height_cm),
      pack_flat: Boolean(p.pack_flat),
    }));

    const packResult = determineBox(cartItems, dimensions);
    const { box } = packResult;

    console.log(`[pudo-create-shipment] Packaging: ${box.code} | ${packResult.totalWeightKg}kg | fits=${packResult.fits}`);

    serviceLevelCode = order.delivery_method === 'locker' ? box.serviceL2L : box.serviceL2D;
    parcelWeight     = packResult.totalWeightKg;
    parcelL          = box.boxL;
    parcelW          = box.boxW;
    parcelH          = box.boxH;
  }

  // ── Build parcel spec ─────────────────────────────────────────────────────
  const parcels = [{
    submitted_length_cm:            parcelL,
    submitted_width_cm:             parcelW,
    submitted_height_cm:            parcelH,
    submitted_weight_kg:            parcelWeight,
    parcel_description:             parcelDesc,
    alternative_tracking_reference: '',
  }];

  // ── Build full payload ────────────────────────────────────────────────────
  let payload: Record<string, unknown>;

  if (order.delivery_method === 'locker') {
    if (!meta.locker_id) return respond({ error: 'delivery_meta.locker_id missing' }, 422, corsHeaders);

    console.log(`[pudo-create-shipment] L2L | order=${order_id} | box=${serviceLevelCode} | dest=${meta.locker_id}`);

    payload = {
      service_level_code:       serviceLevelCode,
      collection_address:       { terminal_id: PHENOME_LOCKER_TERMINAL },
      collection_contact:       COLLECTION_CONTACT,
      delivery_address:         { terminal_id: meta.locker_id },
      delivery_contact:         { name: order.customer_name, email: order.customer_email, mobile_number: phone },
      parcels,
      opt_in_rates:             [],
      opt_in_time_based_rates:  [],
    };

  } else {
    if (!meta.street || !meta.city) return respond({ error: 'delivery_meta missing street/city' }, 422, corsHeaders);

    const zone            = ZONE_MAP[meta.province ?? ''] ?? 'WC';
    const enteredAddress  = `${meta.street}, ${meta.suburb}, ${meta.city}, ${meta.postal}, South Africa`;

    console.log(`[pudo-create-shipment] L2D | order=${order_id} | box=${serviceLevelCode} | dest=${enteredAddress}`);

    payload = {
      service_level_code:       serviceLevelCode,
      collection_address:       { terminal_id: PHENOME_LOCKER_TERMINAL },
      collection_contact:       COLLECTION_CONTACT,
      delivery_address: {
        type:            'residential',
        street_address:  meta.street,
        local_area:      meta.suburb,
        suburb:          meta.suburb,
        city:            meta.city,
        code:            meta.postal,
        zone,
        country:         'South Africa',
        entered_address: enteredAddress,
      },
      delivery_contact:         { name: order.customer_name, email: order.customer_email, mobile_number: phone },
      parcels,
      opt_in_rates:             [],
      opt_in_time_based_rates:  [],
    };
  }

  // ── Call TCG shipments API ────────────────────────────────────────────────
  const pudoKey = Deno.env.get('PUDO_API_KEY') ?? '';
  if (!pudoKey) return respond({ error: 'PUDO_API_KEY not configured' }, 500, corsHeaders);

  let shipmentData: any;
  try {
    const res = await fetch('https://api-tcg.co.za/shipments', {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${pudoKey}`,
        'Accept':         'application/json',
        'Content-Type':   'application/json',
        'requested-from': 'portal',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log(`[pudo-create-shipment] TCG status: ${res.status}`);
    console.log(`[pudo-create-shipment] TCG response (first 800): ${responseText.slice(0, 800)}`);

    if (!res.ok) {
      await supabase.from('shop_orders')
        .update({ pudo_error: `${res.status}: ${responseText.slice(0, 500)}` })
        .eq('id', order_id);
      return respond({ error: 'TCG API error', status: res.status, detail: responseText.slice(0, 500) }, 502, corsHeaders);
    }

    try { shipmentData = JSON.parse(responseText); }
    catch { return respond({ error: 'Invalid JSON from TCG API', raw: responseText.slice(0, 300) }, 502, corsHeaders); }

  } catch (err) {
    console.error('[pudo-create-shipment] Network error:', err);
    return respond({ error: 'Network error calling TCG API', detail: String(err) }, 502, corsHeaders);
  }

  // ── Extract tracking info ─────────────────────────────────────────────────
  const shipmentId  = shipmentData?.id ?? null;
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
    success:           true,
    pudo_shipment_id:  String(shipmentId),
    pudo_tracking_ref: trackingRef,
    service_level:     serviceLevelCode,
    parcel_weight_kg:  parcelWeight,
  }, 200, corsHeaders);
});

// ── Response helper ───────────────────────────────────────────────────────────
function respond(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
