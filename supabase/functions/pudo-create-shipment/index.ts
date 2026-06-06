/**
 * get-shipping-quote
 * Returns live Pudo L2L and L2D delivery prices for a given cart.
 * Packaging engine is inlined (no _shared import — dashboard deploy compatible).
 *
 * POST body: { items: [{ productId: string, qty: number }] }
 * Returns:   { box, service_l2l, service_l2d, locker_fee, door_fee, total_weight_kg }
 *
 * Pricing strategy:
 *   Calls GET https://api-pudo.co.za/api/v1/service-levels with the merchant
 *   Bearer token. This returns the live rate card for the account (same data
 *   shown in the TCG Locker portal). We filter for the two ECO service level
 *   codes that match the determined box size and return their prices.
 *   No address payload required — base ECO rates are not route-dependent.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface CartItem          { productId: string; qty: number; }
interface ProductDimensions { id: string; weight_kg: number; length_cm: number; width_cm: number; height_cm: number; pack_flat: boolean; }
interface PackedItem        { id: string; qty: number; l: number; w: number; h: number; }
interface PudoBox           { code: string; serviceL2L: string; serviceL2D: string; boxL: number; boxW: number; boxH: number; maxKg: number; }

// ── Pudo box definitions ──────────────────────────────────────────────────────
// Service level codes match exactly what TCG returns from /api/v1/service-levels
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

// ── Fetch live service levels from Pudo merchant account ──────────────────────
async function fetchServiceLevels(apiKey: string): Promise<{ data?: any[]; error?: string }> {
  try {
    const res = await fetch('https://api-pudo.co.za/api/v1/service-levels', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'requested-from': 'portal',
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[get-shipping-quote] Pudo service-levels ${res.status}:`, text.slice(0, 300));
      return { error: `Pudo API error ${res.status}: ${text.slice(0, 200)}` };
    }
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return { error: 'Invalid JSON from Pudo' }; }
    // Response may be a bare array or wrapped: { data: [...] } or { service_levels: [...] }
    const levels: any[] = Array.isArray(parsed)
      ? parsed
      : (parsed.data ?? parsed.service_levels ?? parsed.rates ?? []);
    console.log(`[get-shipping-quote] Pudo returned ${levels.length} service levels`);
    return { data: levels };
  } catch (err) {
    return { error: `Network error: ${String(err)}` };
  }
}

// Find the price for a given service level code from the Pudo response.
// Handles multiple possible response shapes from the API.
function extractPrice(levels: any[], code: string): number | null {
  const match = levels.find((l: any) =>
    l.code === code ||
    l.service_level_code === code ||
    l.name === code ||
    l.service_level?.code === code
  );
  if (!match) return null;
  // Price field names vary across API versions
  const raw = match.price ?? match.rate ?? match.amount ?? match.total ?? match.cost;
  if (raw == null) return null;
  return Math.round(Number(raw) * 100) / 100;
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

  // Step 1: Fetch product dimensions from Supabase
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, weight_kg, length_cm, width_cm, height_cm, pack_flat')
    .in('id', items.map(i => i.productId));

  if (prodErr || !products?.length) {
    console.error('[get-shipping-quote] Product fetch error:', prodErr);
    return respond({ error: 'Could not fetch product dimensions' }, 500, corsHeaders);
  }

  // Step 2: Determine box size from cart dimensions
  const dimensions: ProductDimensions[] = products.map((p: any) => ({
    id: p.id, weight_kg: Number(p.weight_kg), length_cm: Number(p.length_cm),
    width_cm: Number(p.width_cm), height_cm: Number(p.height_cm), pack_flat: Boolean(p.pack_flat),
  }));

  const result = determineBox(items, dimensions);
  console.log(`[get-shipping-quote] Box: ${result.box.code} | ${result.totalWeightKg}kg | fits: ${result.fits}`);

  if (!result.fits)
    return respond({ error: 'Cart exceeds maximum Pudo box size. Please contact us.', box: result.box.code }, 422, corsHeaders);

  // Step 3: Fetch live service level prices from Pudo merchant account
  const pudoKey = Deno.env.get('PUDO_API_KEY') ?? '';
  if (!pudoKey) return respond({ error: 'PUDO_API_KEY not configured' }, 500, corsHeaders);

  const { data: levels, error: levelsErr } = await fetchServiceLevels(pudoKey);

  if (levelsErr || !levels?.length) {
    console.error('[get-shipping-quote] Service levels error:', levelsErr);
    return respond({ error: 'Could not retrieve delivery rates. Please try again.' }, 502, corsHeaders);
  }

  // Step 4: Extract the price for the determined box size
  const { box } = result;
  const lockerFee = extractPrice(levels, box.serviceL2L);
  const doorFee   = extractPrice(levels, box.serviceL2D);

  if (lockerFee === null || doorFee === null) {
    // Log available codes to help diagnose code mismatches
    const available = levels.map((l: any) => l.code ?? l.service_level_code ?? l.name ?? '?').join(', ');
    console.error(`[get-shipping-quote] Could not find ${box.serviceL2L} or ${box.serviceL2D} in response. Available: ${available}`);
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

function respond(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
