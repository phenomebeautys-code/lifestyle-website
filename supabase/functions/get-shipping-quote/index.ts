import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')              ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ── Pudo rate row shape ── */
interface PudoRate {
  box_size:      string;
  max_weight_kg: number;
  max_length_cm: number;
  max_width_cm:  number;
  max_height_cm: number;
  locker_fee:    number;
  door_fee:      number;
}

/* ── Product dimension row shape ── */
interface ProductDims {
  id:        string;
  weight_kg: number;
  length_cm: number;
  width_cm:  number;
  height_cm: number;
}

/* ── Packing constants ── */
const PACKING_EFFICIENCY     = 0.70;  // 70% usable volume after box overhead and padding
const BOX_HEIGHT_OVERHEAD_CM = 2.0;   // packaging adds ~2cm to each item height
const BOX_WEIGHT_OVERHEAD_KG = 0.050; // packaging adds ~50g per item

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body  = await req.json();
    const items: { productId: string; qty: number }[] = Array.isArray(body?.items)
      ? body.items
      : [];

    if (!items.length) {
      return new Response(
        JSON.stringify({ error: 'No items provided.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    /* ── 1. Load Pudo rates — M, L, XL only (XS and S excluded by height) ── */
    const { data: rates, error: ratesError } = await supabase
      .from('pudo_rates')
      .select('box_size, max_weight_kg, max_length_cm, max_width_cm, max_height_cm, locker_fee, door_fee')
      .in('box_size', ['M', 'L', 'XL'])
      .order('max_weight_kg', { ascending: true });

    if (ratesError || !Array.isArray(rates) || rates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Could not load shipping rates. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    /* ── 2. Load product dimensions ── */
    const productIds = items
      .map(i => i.productId)
      .filter(id => typeof id === 'string' && id.length > 0);

    const DEFAULT_DIMS: Omit<ProductDims, 'id'> = {
      weight_kg: 0.500,
      length_cm: 10.0,
      width_cm:  10.0,
      height_cm: 10.0,
    };

    const dimsMap: Record<string, Omit<ProductDims, 'id'>> = {};

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, weight_kg, length_cm, width_cm, height_cm')
        .in('id', productIds);

      if (Array.isArray(products)) {
        for (const p of products) {
          if (p.id) {
            dimsMap[p.id] = {
              weight_kg: Number(p.weight_kg) > 0 ? Number(p.weight_kg) : DEFAULT_DIMS.weight_kg,
              length_cm: Number(p.length_cm) > 0 ? Number(p.length_cm) : DEFAULT_DIMS.length_cm,
              width_cm:  Number(p.width_cm)  > 0 ? Number(p.width_cm)  : DEFAULT_DIMS.width_cm,
              height_cm: Number(p.height_cm) > 0 ? Number(p.height_cm) : DEFAULT_DIMS.height_cm,
            };
          }
        }
      }
    }

    /* ── 3. Compute total packed volume, weight, and max item height ──
       Volume approach: items can be arranged freely (upright, side by side,
       stacked) so we use total packed volume against the box's usable volume
       at 70% packing efficiency.

       packed_vol per item = length x width x (height + BOX_HEIGHT_OVERHEAD_CM)
       max_h  = tallest single packed item — must not exceed box height
       total_kg = sum of (weight + BOX_WEIGHT_OVERHEAD_KG) x qty
    ── */
    let totalPackedVol = 0;
    let totalWeightKg  = 0;
    let maxPackedH     = 0;

    for (const item of items) {
      const qty  = Math.max(1, Number(item.qty) || 1);
      const dims = dimsMap[item.productId] ?? DEFAULT_DIMS;

      const packedH = dims.height_cm + BOX_HEIGHT_OVERHEAD_CM;
      const itemVol = dims.length_cm * dims.width_cm * packedH;

      totalPackedVol += itemVol * qty;
      totalWeightKg  += (dims.weight_kg + BOX_WEIGHT_OVERHEAD_KG) * qty;
      if (packedH > maxPackedH) maxPackedH = packedH;
    }

    totalPackedVol = Math.round(totalPackedVol * 1000) / 1000;
    totalWeightKg  = Math.round(totalWeightKg  * 1000) / 1000;
    maxPackedH     = Math.round(maxPackedH     * 1000) / 1000;

    /* ── 4. Select smallest fitting box ──
       Rates are ordered M -> L -> XL (weight ascending).

       A box fits when all three conditions are true simultaneously:
         1. total packed volume <= box volume x PACKING_EFFICIENCY
         2. total weight        <= box max_weight_kg
         3. tallest packed item <= box max_height_cm

       We take the first box that satisfies all three.
       If nothing fits, the order is oversized — door delivery only.
    ── */
    let selectedRate: PudoRate | null = null;

    for (const rate of rates) {
      const boxVol    = Number(rate.max_length_cm) * Number(rate.max_width_cm) * Number(rate.max_height_cm);
      const usableVol = boxVol * PACKING_EFFICIENCY;

      const fits =
        totalPackedVol <= usableVol &&
        totalWeightKg  <= Number(rate.max_weight_kg) &&
        maxPackedH     <= Number(rate.max_height_cm);

      if (fits) {
        selectedRate = rate as PudoRate;
        break;
      }
    }

    /* ── 5. Oversized: exceeds all boxes — door delivery only ── */
    if (!selectedRate) {
      return new Response(
        JSON.stringify({
          oversized:       true,
          box:             null,
          locker_fee:      null,
          door_fee:        Number((rates[rates.length - 1] as PudoRate).door_fee),
          total_weight_kg: totalWeightKg,
          packed_vol_cm3:  totalPackedVol,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        oversized:       false,
        box:             selectedRate.box_size,
        locker_fee:      Number(selectedRate.locker_fee),
        door_fee:        Number(selectedRate.door_fee),
        total_weight_kg: totalWeightKg,
        packed_vol_cm3:  totalPackedVol,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[get-shipping-quote] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
