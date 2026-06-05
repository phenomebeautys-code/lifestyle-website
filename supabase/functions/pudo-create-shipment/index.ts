/**
 * pudo-create-shipment
 * Called after Yoco payment confirms (payment_status = 'paid').
 * Packaging engine is inlined (no _shared import — dashboard deploy compatible).
 *
 * POST body: { order_id: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://www.phenomebeauty.co.za', 'https://phenomebeauty.co.za'];
const PHENOME_LOCKER_TERMINAL = 'CG0000';
const COLLECTION_CONTACT = { name: 'PhenomeBeauty', email: 'hello@phenomebeauty.co.za', mobile_number: '+27745115725' };
const ZONE_MAP: Record<string, string> = {
  'Western Cape': 'WC', 'Eastern Cape': 'EC', 'Northern Cape': 'NC',
  'Gauteng': 'GP', 'KwaZulu-Natal': 'KZN', 'Free State': 'FS',
  'Limpopo': 'LP', 'Mpumalanga': 'MP', 'North West': 'NW',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface CartItem          { productId: string; qty: number; }
interface ProductDimensions { id: string; weight_kg: number; length_cm: number; width_cm: number; height_cm: number; pack_flat: boolean; }
interface PackedItem        { id: string; qty: number; l: number; w: number; h: number; }
interface PudoBox           { code: string; serviceL2L: string; serviceL2D: string; boxL: number; boxW: number; boxH: number; maxKg: number; }

// ── Pudo box definitions ──────────────────────────────────────────────────────
const PUDO_BOXES: PudoBox[] = [
  { code: 'XS', serviceL2L: 'L2LXS - ECO', serviceL2D: 'L2DXS - ECO', boxL: 60, boxW: 17, boxH: 8,  maxKg: 2  },
  { code: 'S',  serviceL2L: 'L2LS - ECO',  serviceL2D: 'L2DS - ECO',  boxL: 60, boxW: 41, boxH: 8,  maxKg: 5  },
  { code: 'M',  serviceL2L: 'L2LM - ECO',  serviceL2D: 'L2DM - ECO',  boxL: 60, boxW: 41, boxH: 19, maxKg: 10 },
  { code: 'L',  serviceL2L: 'L2LL - ECO',  serviceL2D: 'L2DL - ECO',  boxL: 60, boxW: 41, boxH: 41, maxKg: 15 },
  { code: 'XL', serviceL2L: 'L2LXL - ECO', serviceL2D: 'L2DXL - ECO', boxL: 60, boxW: 41, boxH: 69, maxKg: 20 },
];

// ── Packaging engine ──────────────────────────────────────────────────────────
function getPackedDimensions(p: ProductDimensions): { l: number; w: number; h: number } {
  const dims = [p.length_cm, p.width_cm, p.height_cm].sort((a, b) => b - a);
  if (p.pack_flat) return { l: dims[0], w: dims[1], h: dims[2] };
  return { l: p.length_cm, w: p.width_cm, h: p.height_cm };
}

function fitsInBox(items: PackedItem[], box: PudoBox): boolean {
  const units: { l: number; w: number; h: number }[] = [];
  for (const item of items) for (let i = 0; i < item.qty; i++) units.push({ l: item.l, w: item.w, h: item.h });
  units.sort((a, b) => b.h - a.h);
  let usedHeight = 0;
  let remaining = [...units];
  while (remaining.length > 0) {
    const layerH = remaining[0].h;
    usedHeight += layerH;
    if (usedHeight > box.boxH) return false;
    let usedL = 0, usedW = 0, rowH = 0;
    const packed: number[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const u = remaining[i];
      if (u.h > layerH) continue;
      if (usedL + u.l <= box.boxL && u.w <= box.boxW) {
        if (usedW + u.w <= box.boxW) { usedL += u.l; rowH = Math.max(rowH, u.w); packed.push(i); }
        else if (u.l <= box.boxL && u.w <= box.boxW) { usedW += rowH; usedL = u.l; rowH = u.w; if (usedW + rowH <= box.boxW) packed.push(i); }
      } else if (u.w <= box.boxL && u.l <= box.boxW && usedL + u.w <= box.boxL) {
        usedL += u.w; rowH = Math.max(rowH, u.l); packed.push(i);
      }
    }
    if (packed.length === 0) return false;
    for (let i = packed.length - 1; i >= 0; i--) remaining.splice(packed[i], 1);
  }
  return true;
}

function determineBox(cartItems: CartItem[], productDimensions: ProductDimensions[]) {
  const dimMap = new Map(productDimensions.map(p => [p.id, p]));
  const packedItems: PackedItem[] = [];
  let totalWeightKg = 0;
  for (const item of cartItems) {
    const dim = dimMap.get(item.productId);
    if (!dim) continue;
    const { l, w, h } = getPackedDimensions(dim);
    packedItems.push({ id: item.productId, qty: item.qty, l, w, h });
    totalWeightKg += dim.weight_kg * item.qty;
  }
  totalWeightKg = Math.round(totalWeightKg * 1000) / 1000;
  for (const box of PUDO_BOXES) {
    if (totalWeightKg > box.maxKg) continue;
    if (fitsInBox(packedItems, box)) return { box, totalWeightKg, packed: packedItems, fits: true };
  }
  return { box: PUDO_BOXES[PUDO_BOXES.length - 1], totalWeightKg, packed: packedItems, fits: false };
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
  try { body = await req.json(); } catch { return respond({ error: 'Invalid JSON body' }, 400, corsHeaders); }

  const { order_id } = body;
  if (!order_id) return respond({ error: 'order_id is required' }, 400, corsHeaders);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: order, error: orderErr } = await supabase
    .from('shop_orders')
    .select('id, customer_name, customer_email, customer_phone, delivery_method, delivery_meta, items, pudo_shipment_id')
    .eq('id', order_id)
    .single();

  if (orderErr || !order) {
    console.error('[pudo-create-shipment] Order fetch error:', orderErr);
    return respond({ error: 'Order not found' }, 404, corsHeaders);
  }

  if (!['locker', 'door'].includes(order.delivery_method))
    return respond({ skipped: true, reason: `Unknown delivery_method: ${order.delivery_method}` }, 200, corsHeaders);

  if (order.pudo_shipment_id) {
    console.log('[pudo-create-shipment] Already exists:', order.pudo_shipment_id);
    return respond({ skipped: true, reason: 'Shipment already created', pudo_shipment_id: order.pudo_shipment_id }, 200, corsHeaders);
  }

  const meta       = (order.delivery_meta ?? {}) as Record<string, string>;
  const orderItems: any[] = Array.isArray(order.items) ? order.items : [];
  const parcelDesc = orderItems.map((i: any) => `${i.name} x${i.qty}`).join(', ') || 'Beauty products';
  const phone      = (order.customer_phone ?? '').replace(/\s/g, '');

  // ── Packaging engine ──────────────────────────────────────────────────────
  const cartItems: CartItem[] = orderItems.map((i: any) => ({ productId: i.productId ?? i.id, qty: Number(i.qty) || 1 }));
  const productIds = [...new Set(cartItems.map(i => i.productId))];
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, weight_kg, length_cm, width_cm, height_cm, pack_flat')
    .in('id', productIds);

  let serviceLevelCode: string;
  let parcelWeight: number;
  let parcelL: number, parcelW: number, parcelH: number;

  if (prodErr || !products?.length) {
    console.warn('[pudo-create-shipment] Dimension fetch failed — using XS fallback');
    serviceLevelCode = order.delivery_method === 'locker' ? 'L2LXS - ECO' : 'L2DXS - ECO';
    parcelWeight = 1; parcelL = 60; parcelW = 17; parcelH = 8;
  } else {
    const dimensions: ProductDimensions[] = products.map((p: any) => ({
      id: p.id, weight_kg: Number(p.weight_kg), length_cm: Number(p.length_cm),
      width_cm: Number(p.width_cm), height_cm: Number(p.height_cm), pack_flat: Boolean(p.pack_flat),
    }));
    const packResult = determineBox(cartItems, dimensions);
    const { box } = packResult;
    console.log(`[pudo-create-shipment] Box: ${box.code} | ${packResult.totalWeightKg}kg | fits: ${packResult.fits}`);
    serviceLevelCode = order.delivery_method === 'locker' ? box.serviceL2L : box.serviceL2D;
    parcelWeight = packResult.totalWeightKg;
    parcelL = box.boxL; parcelW = box.boxW; parcelH = box.boxH;
  }

  const parcels = [{
    submitted_length_cm: parcelL, submitted_width_cm: parcelW,
    submitted_height_cm: parcelH, submitted_weight_kg: parcelWeight,
    parcel_description: parcelDesc, alternative_tracking_reference: '',
  }];

  // ── Build payload ─────────────────────────────────────────────────────────
  let payload: Record<string, unknown>;

  if (order.delivery_method === 'locker') {
    if (!meta.locker_id) return respond({ error: 'delivery_meta.locker_id missing' }, 422, corsHeaders);
    console.log(`[pudo-create-shipment] L2L | order=${order_id} | svc=${serviceLevelCode} | dest=${meta.locker_id}`);
    payload = {
      service_level_code: serviceLevelCode,
      collection_address: { terminal_id: PHENOME_LOCKER_TERMINAL },
      collection_contact: COLLECTION_CONTACT,
      delivery_address:   { terminal_id: meta.locker_id },
      delivery_contact:   { name: order.customer_name, email: order.customer_email, mobile_number: phone },
      parcels, opt_in_rates: [], opt_in_time_based_rates: [],
    };
  } else {
    if (!meta.street || !meta.city) return respond({ error: 'delivery_meta missing street/city' }, 422, corsHeaders);
    const zone           = ZONE_MAP[meta.province ?? ''] ?? 'WC';
    const enteredAddress = `${meta.street}, ${meta.suburb}, ${meta.city}, ${meta.postal}, South Africa`;
    console.log(`[pudo-create-shipment] L2D | order=${order_id} | svc=${serviceLevelCode} | dest=${enteredAddress}`);
    payload = {
      service_level_code: serviceLevelCode,
      collection_address: { terminal_id: PHENOME_LOCKER_TERMINAL },
      collection_contact: COLLECTION_CONTACT,
      delivery_address: {
        type: 'residential', street_address: meta.street, local_area: meta.suburb,
        suburb: meta.suburb, city: meta.city, code: meta.postal,
        zone, country: 'South Africa', entered_address: enteredAddress,
      },
      delivery_contact: { name: order.customer_name, email: order.customer_email, mobile_number: phone },
      parcels, opt_in_rates: [], opt_in_time_based_rates: [],
    };
  }

  // ── Call TCG API ──────────────────────────────────────────────────────────
  const pudoKey = Deno.env.get('PUDO_API_KEY') ?? '';
  if (!pudoKey) return respond({ error: 'PUDO_API_KEY not configured' }, 500, corsHeaders);

  let shipmentData: any;
  try {
    const res = await fetch('https://api-tcg.co.za/shipments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${pudoKey}`, 'Accept': 'application/json', 'Content-Type': 'application/json', 'requested-from': 'portal' },
      body: JSON.stringify(payload),
    });
    const responseText = await res.text();
    console.log(`[pudo-create-shipment] TCG ${res.status}: ${responseText.slice(0, 600)}`);
    if (!res.ok) {
      await supabase.from('shop_orders').update({ pudo_error: `${res.status}: ${responseText.slice(0,500)}` }).eq('id', order_id);
      return respond({ error: 'TCG API error', status: res.status, detail: responseText.slice(0,500) }, 502, corsHeaders);
    }
    try { shipmentData = JSON.parse(responseText); }
    catch { return respond({ error: 'Invalid JSON from TCG', raw: responseText.slice(0,300) }, 502, corsHeaders); }
  } catch (err) {
    console.error('[pudo-create-shipment] Network error:', err);
    return respond({ error: 'Network error', detail: String(err) }, 502, corsHeaders);
  }

  const shipmentId  = shipmentData?.id ?? null;
  const trackingRef = shipmentData?.custom_tracking_reference ?? shipmentData?.tracking_reference ?? String(shipmentId) ?? null;

  await supabase.from('shop_orders').update({
    pudo_shipment_id: String(shipmentId), pudo_tracking_ref: trackingRef, pudo_error: null,
  }).eq('id', order_id);

  console.log(`[pudo-create-shipment] order=${order_id} | method=${order.delivery_method} | shipment=${shipmentId} | tracking=${trackingRef}`);
  return respond({ success: true, pudo_shipment_id: String(shipmentId), pudo_tracking_ref: trackingRef, service_level: serviceLevelCode, parcel_weight_kg: parcelWeight }, 200, corsHeaders);
});

function respond(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
