/**
 * get-shipping-quote
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns live Pudo L2L and L2D delivery prices for a given cart.
 *
 * Flow:
 *   1. Receive cart items { productId, qty }[]
 *   2. Fetch product dimensions from shop_products
 *   3. Run packaging engine → determine minimum Pudo box
 *   4. Call POST https://api-pudo.co.za/rates for both L2L and L2D
 *      using the correct service_level_code for the box size
 *   5. Return { box, locker_fee, door_fee, total_weight_kg }
 *
 * The delivery fee returned is the FULL customer-facing price (VAT + surcharges
 * included — Pudo returns an all-inclusive rate). Box cost is absorbed by
 * PhenomeBeauty and is NOT added to the customer's fee.
 *
 * POST body: { items: [{ productId: string, qty: number }] }
 *
 * Env vars:
 *   PUDO_API_KEY              — Pudo/TCG Bearer token
 *   SUPABASE_URL              — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { determineBox, PUDO_BOXES, type CartItem, type ProductDimensions } from '../_shared/packaging-engine.ts';

const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

// Generic Cape Town locker used for rate lookups (CG107 = Cape Town CBD)
// Pudo L2L rates are flat per parcel — destination locker doesn't change the price
// for standard zones, but we supply a real terminal_id to satisfy the API
const QUOTE_LOCKER_ID = 'CG107';

// Generic Cape Town address for L2D rate lookup
// L2D rates are zone-based; Cape Town = Western Cape zone
const QUOTE_DOOR_ADDRESS = {
  type:           'residential',
  street_address: '1 Adderley Street',
  local_area:     'Cape Town City Centre',
  suburb:         'Cape Town City Centre',
  city:           'Cape Town',
  code:           '8001',
  zone:           'WC',
  country:        'South Africa',
};

// Collection is always CG0000 — PhenomeBeauty drops at any locker
const COLLECTION_ADDRESS = { terminal_id: 'CG0000' };

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
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405, corsHeaders);

  let body: { items?: CartItem[] };
  try { body = await req.json(); }
  catch { return respond({ error: 'Invalid JSON body' }, 400, corsHeaders); }

  const { items } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return respond({ error: 'items array is required and must not be empty' }, 400, corsHeaders);
  }

  // ── Fetch product dimensions ──────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const productIds = items.map(i => i.productId);
  const { data: products, error: prodErr } = await supabase
    .from('shop_products')
    .select('id, weight_kg, length_cm, width_cm, height_cm, pack_flat')
    .in('id', productIds);

  if (prodErr || !products?.length) {
    console.error('[get-shipping-quote] Product fetch error:', prodErr);
    return respond({ error: 'Could not fetch product dimensions' }, 500, corsHeaders);
  }

  const dimensions: ProductDimensions[] = products.map((p: any) => ({
    id:        p.id,
    weight_kg: Number(p.weight_kg),
    length_cm: Number(p.length_cm),
    width_cm:  Number(p.width_cm),
    height_cm: Number(p.height_cm),
    pack_flat: Boolean(p.pack_flat),
  }));

  // ── Run packaging engine ──────────────────────────────────────────────────
  const result = determineBox(items, dimensions);

  console.log(`[get-shipping-quote] Box: ${result.box.code} | Weight: ${result.totalWeightKg}kg | Fits: ${result.fits}`);

  if (!result.fits) {
    // Cart exceeds XL — extremely unlikely with current product range
    return respond({
      error: 'Cart exceeds maximum Pudo box size (XL, 20kg). Please contact us directly.',
      box:   result.box.code,
    }, 422, corsHeaders);
  }

  // ── Call Pudo rates API ───────────────────────────────────────────────────
  const pudoKey = Deno.env.get('PUDO_API_KEY') ?? '';
  if (!pudoKey) return respond({ error: 'PUDO_API_KEY not configured' }, 500, corsHeaders);

  const { box } = result;

  // Build L2L and L2D rate requests in parallel
  const [l2lRes, l2dRes] = await Promise.all([
    fetchRate(pudoKey, {
      service_level_code: box.serviceL2L,
      collection_address: COLLECTION_ADDRESS,
      delivery_address:   { terminal_id: QUOTE_LOCKER_ID },
    }),
    fetchRate(pudoKey, {
      service_level_code: box.serviceL2D,
      collection_address: COLLECTION_ADDRESS,
      delivery_address:   QUOTE_DOOR_ADDRESS,
    }),
  ]);

  if (l2lRes.error || l2dRes.error) {
    console.error('[get-shipping-quote] Pudo rate error:', l2lRes.error ?? l2dRes.error);
    return respond({ error: 'Could not retrieve delivery rates. Please try again.' }, 502, corsHeaders);
  }

  // Extract the all-inclusive rate (VAT + fuel surcharge + currency surcharge already included)
  const lockerFee = extractRate(l2lRes.data, box.serviceL2L);
  const doorFee   = extractRate(l2dRes.data, box.serviceL2D);

  if (lockerFee === null || doorFee === null) {
    console.error('[get-shipping-quote] Rate not found in response:', JSON.stringify(l2lRes.data), JSON.stringify(l2dRes.data));
    return respond({ error: 'Rate data not found in Pudo response.' }, 502, corsHeaders);
  }

  console.log(`[get-shipping-quote] L2L: R${lockerFee} | L2D: R${doorFee}`);

  return respond({
    box:             box.code,
    service_l2l:     box.serviceL2L,
    service_l2d:     box.serviceL2D,
    locker_fee:      lockerFee,
    door_fee:        doorFee,
    total_weight_kg: result.totalWeightKg,
  }, 200, corsHeaders);
});

// ── Call Pudo rates endpoint ──────────────────────────────────────────────────
async function fetchRate(apiKey: string, payload: Record<string, unknown>): Promise<{ data?: any; error?: string }> {
  try {
    const res = await fetch('https://api-pudo.co.za/rates', {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Accept':         'application/json',
        'Content-Type':   'application/json',
        'requested-from': 'portal',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`[get-shipping-quote] Pudo API ${res.status}:`, text.slice(0, 300));
      return { error: `Pudo API error ${res.status}` };
    }

    try {
      return { data: JSON.parse(text) };
    } catch {
      return { error: 'Invalid JSON from Pudo rates API' };
    }
  } catch (err) {
    return { error: `Network error: ${String(err)}` };
  }
}

// ── Extract the rate amount from Pudo response ────────────────────────────────
// Pudo returns an array of rate objects; find the matching service level
// The `rate` field is the all-inclusive VAT price (surcharges already included)
function extractRate(data: any, serviceLevelCode: string): number | null {
  if (!data) return null;

  // Response may be an array of rate objects or { rates: [...] }
  const rates: any[] = Array.isArray(data) ? data : (data.rates ?? data.data ?? []);

  const match = rates.find((r: any) =>
    r.service_level?.code === serviceLevelCode ||
    r.service_level_code  === serviceLevelCode ||
    r.code                === serviceLevelCode
  );

  if (!match) return null;

  // Rate field names vary — try common ones
  const amount = match.rate ?? match.total ?? match.price ?? match.amount;
  if (amount == null) return null;

  return Math.round(Number(amount) * 100) / 100; // round to 2 decimal places
}

// ── Response helper ───────────────────────────────────────────────────────────
function respond(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
