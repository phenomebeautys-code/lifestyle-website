import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')              ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ── Pudo rate row shape ── */
interface PudoRate {
  box_size:       string;
  max_weight_kg:  number;
  max_length_cm:  number;
  max_width_cm:   number;
  max_height_cm:  number;
  locker_fee:     number;
  door_fee:       number;
}

/* ── Product dimension row shape ── */
interface ProductDims {
  id:         string;
  weight_kg:  number;
  length_cm:  number;
  width_cm:   number;
  height_cm:  number;
  pack_flat:  boolean;
}

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

    /* ── 1. Load Pudo rates ── */
    const { data: rates, error: ratesError } = await supabase
      .from('pudo_rates')
      .select('box_size, max_weight_kg, max_length_cm, max_width_cm, max_height_cm, locker_fee, door_fee')
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
      pack_flat: false,
    };

    let dimsMap: Record<string, Omit<ProductDims, 'id'>> = {};

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, weight_kg, length_cm, width_cm, height_cm, pack_flat')
        .in('id', productIds);

      if (Array.isArray(products)) {
        for (const p of products) {
          if (p.id) {
            dimsMap[p.id] = {
              weight_kg: Number(p.weight_kg) > 0 ? Number(p.weight_kg) : DEFAULT_DIMS.weight_kg,
              length_cm: Number(p.length_cm) > 0 ? Number(p.length_cm) : DEFAULT_DIMS.length_cm,
              width_cm:  Number(p.width_cm)  > 0 ? Number(p.width_cm)  : DEFAULT_DIMS.width_cm,
              height_cm: Number(p.height_cm) > 0 ? Number(p.height_cm) : DEFAULT_DIMS.height_cm,
              pack_flat: !!p.pack_flat,
            };
          }
        }
      }
    }

    /* ── 3. Compute bounding box (Option B: sum lengths, max W and H) ──
       - Tub items and flat-pack items both stack in the length axis per qty
       - W = max width across all items
       - H = max height across all items
       - Total weight = sum of weight_kg x qty
    ── */
    let totalLengthCm = 0;
    let maxWidthCm    = 0;
    let maxHeightCm   = 0;
    let totalWeightKg = 0;

    for (const item of items) {
      const qty  = Math.max(1, Number(item.qty) || 1);
      const dims = dimsMap[item.productId] ?? DEFAULT_DIMS;

      /* Length stacks with qty for all items */
      totalLengthCm += dims.length_cm * qty;

      /* Width and height take the max across all items */
      if (dims.width_cm  > maxWidthCm)  maxWidthCm  = dims.width_cm;
      if (dims.height_cm > maxHeightCm) maxHeightCm = dims.height_cm;

      totalWeightKg += dims.weight_kg * qty;
    }

    /* Round to 3 decimal places */
    totalLengthCm = Math.round(totalLengthCm * 1000) / 1000;
    maxWidthCm    = Math.round(maxWidthCm    * 1000) / 1000;
    maxHeightCm   = Math.round(maxHeightCm   * 1000) / 1000;
    totalWeightKg = Math.round(totalWeightKg * 1000) / 1000;

    /* ── 4. Select smallest fitting box ──
       Pudo box dimensions are L x W x H.
       We match our bounding box against max_length_cm, max_width_cm, max_height_cm.
       Rates are already ordered by max_weight_kg ascending (smallest first).
       We also sort by volume ascending to ensure smallest box wins.
    ── */
    const sortedRates = [...rates].sort((a, b) => {
      const volA = Number(a.max_length_cm) * Number(a.max_width_cm) * Number(a.max_height_cm);
      const volB = Number(b.max_length_cm) * Number(b.max_width_cm) * Number(b.max_height_cm);
      return volA - volB;
    });

    /* M box is the height fallback ceiling for all current products */
    const mBox = sortedRates.find(r => r.box_size === 'M') ?? sortedRates[sortedRates.length - 1];

    let selectedRate: PudoRate | null = null;

    for (const rate of sortedRates) {
      const fits =
        totalLengthCm  <= Number(rate.max_length_cm)  &&
        maxWidthCm     <= Number(rate.max_width_cm)    &&
        maxHeightCm    <= Number(rate.max_height_cm)   &&
        totalWeightKg  <= Number(rate.max_weight_kg);

      if (fits) {
        selectedRate = rate as PudoRate;
        break;
      }
    }

    /* Fall back to M box if nothing fits on current product range */
    if (!selectedRate) {
      selectedRate = mBox as PudoRate;
    }

    const response = {
      box:             selectedRate.box_size,
      locker_fee:      Number(selectedRate.locker_fee),
      door_fee:        Number(selectedRate.door_fee),
      total_weight_kg: totalWeightKg,
      packed_dims: {
        length_cm: totalLengthCm,
        width_cm:  maxWidthCm,
        height_cm: maxHeightCm,
      },
    };

    return new Response(
      JSON.stringify(response),
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
