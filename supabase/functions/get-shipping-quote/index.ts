/**
 * get-shipping-quote
 * Returns live Pudo L2L and L2D delivery prices for a given cart.
 * Packaging engine is inlined (no _shared import — dashboard deploy compatible).
 *
 * POST body: { items: [{ productId: string, qty: number }] }
 * Returns:   { box, service_l2l, service_l2d, locker_fee, door_fee, total_weight_kg }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

// ── Pudo rate-quote addresses ─────────────────────────────────────────────────
// Collection: PhenomeBeauty's own Pudo locker terminal
const COLLECTION_TERMINAL_ID = 'CG0000';

// Quote destination for L2L: any locker (used only to get the rate — not the real delivery locker)
const QUOTE_L2L_DEST_TERMINAL = 'CG107';

// Quote destination for L2D: a representative residential address (Cape Town)
// Pudo requires a full address object with lat/lng for L2D rate quotes
const QUOTE_L2D_DEST_ADDRESS = {
  type: 'residential',
  street_address: '1 Adderley Street',
  local_area: 'Cape Town City Centre',
  suburb: 'Cape Town City Centre',
  city: 'Cape Town',
  code: '8001',
  zone: 'WC',
  country: 'South Africa',
  entered_address: '1 Adderley St, Cape Town City Centre, Cape Town, 8001, South Africa',
  lat: '-33.9248685',
  lng: '18.4240553',
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

  let body: { items?: CartItem[] };
  try { body = await req.json(); } catch { return respond({ error: 'Invalid JSON' }, 400, corsHeaders); }

  const { items } = body;
  if (!Array.isArray(items) || items.length === 0)
    return respond({ error: 'items array required' }, 400, corsHeaders);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, weight_kg, length_cm, width_cm, height_cm, pack_flat')
    .in('id', items.map(i => i.productId));

  if (prodErr || !products?.length) {
    console.error('[get-shipping-quote] Product fetch error:', prodErr);
    return respond({ error: 'Could not fetch product dimensions' }, 500, corsHeaders);
  }

  const dimensions: ProductDimensions[] = products.map((p: any) => ({
    id: p.id, weight_kg: Number(p.weight_kg), length_cm: Number(p.length_cm),
    width_cm: Number(p.width_cm), height_cm: Number(p.height_cm), pack_flat: Boolean(p.pack_flat),
  }));

  const result = determineBox(items, dimensions);
  console.log(`[get-shipping-quote] Box: ${result.box.code} | ${result.totalWeightKg}kg | fits: ${result.fits}`);

  if (!result.fits)
    return respond({ error: 'Cart exceeds maximum Pudo box size. Please contact us.', box: result.box.code }, 422, corsHeaders);

  const pudoKey = Deno.env.get('PUDO_API_KEY') ?? '';
  if (!pudoKey) return respond({ error: 'PUDO_API_KEY not configured' }, 500, corsHeaders);

  const { box } = result;

  // L2L: locker terminal to locker terminal — Pudo returns all L2L service levels, pick by code
  const l2lPayload = {
    collection_address: { terminal_id: COLLECTION_TERMINAL_ID },
    delivery_address:   { terminal_id: QUOTE_L2L_DEST_TERMINAL },
    opt_in_rates: [],
    opt_in_time_based_rates: [],
  };

  // L2D: locker terminal to residential address — Pudo returns all L2D service levels, pick by code
  const l2dPayload = {
    collection_address: { terminal_id: COLLECTION_TERMINAL_ID },
    delivery_address:   QUOTE_L2D_DEST_ADDRESS,
    opt_in_rates: [],
    opt_in_time_based_rates: [],
  };

  const [l2lRes, l2dRes] = await Promise.all([
    fetchRates(pudoKey, l2lPayload),
    fetchRates(pudoKey, l2dPayload),
  ]);

  if (l2lRes.error || l2dRes.error) {
    console.error('[get-shipping-quote] Pudo rate error:', l2lRes.error ?? l2dRes.error);
    return respond({ error: 'Could not retrieve delivery rates. Please try again.' }, 502, corsHeaders);
  }

  const lockerFee = extractRate(l2lRes.data, box.serviceL2L);
  const doorFee   = extractRate(l2dRes.data, box.serviceL2D);

  if (lockerFee === null || doorFee === null) {
    console.error('[get-shipping-quote] Rate not found. L2L:', JSON.stringify(l2lRes.data).slice(0, 300), 'L2D:', JSON.stringify(l2dRes.data).slice(0, 300));
    return respond({ error: 'Rate data not found in Pudo response.' }, 502, corsHeaders);
  }

  console.log(`[get-shipping-quote] L2L: R${lockerFee} | L2D: R${doorFee}`);
  return respond({
    box: box.code,
    service_l2l: box.serviceL2L,
    service_l2d: box.serviceL2D,
    locker_fee: lockerFee,
    door_fee: doorFee,
    total_weight_kg: result.totalWeightKg,
  }, 200, corsHeaders);
});

async function fetchRates(apiKey: string, payload: Record<string, unknown>): Promise<{ data?: any; error?: string }> {
  try {
    const res  = await fetch('https://api-pudo.co.za/rates', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'requested-from': 'portal',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`Pudo ${res.status}:`, text.slice(0, 300));
      return { error: `Pudo API error ${res.status}` };
    }
    try { return { data: JSON.parse(text) }; } catch { return { error: 'Invalid JSON from Pudo' }; }
  } catch (err) {
    return { error: `Network error: ${String(err)}` };
  }
}

// Pudo returns { rates: [ { rate: "68.75", service_level: { code: "L2LXS - ECO" }, ... } ] }
function extractRate(data: any, serviceLevelCode: string): number | null {
  if (!data) return null;
  const rates: any[] = Array.isArray(data) ? data : (data.rates ?? data.data ?? []);
  const match = rates.find((r: any) =>
    r.service_level?.code === serviceLevelCode ||
    r.service_level_code  === serviceLevelCode ||
    r.code                === serviceLevelCode
  );
  if (!match) return null;
  const amount = match.rate ?? match.total ?? match.price ?? match.amount;
  if (amount == null) return null;
  return Math.round(Number(amount) * 100) / 100;
}

function respond(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
