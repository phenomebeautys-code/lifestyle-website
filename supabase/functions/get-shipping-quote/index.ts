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
  weight_kg: number;
  length_cm: number;
  width_cm:  number;
  height_cm: number;
  pack_flat: boolean;
}

interface PackedUnit { l: number; w: number; h: number; }

/* ── Orientation: mirrors packaging-engine.ts ──
   pack_flat items are laid on their largest face (shortest dimension = height).
   Everything else ships in its stored, as-measured orientation (real shipper/
   candle box dims — no artificial padding added; lockers have been tested to
   accept a flush, zero-clearance fit). ── */
function getPackedDimensions(dims: ProductDims): PackedUnit {
  if (dims.pack_flat) {
    const sorted = [dims.length_cm, dims.width_cm, dims.height_cm].sort((a, b) => b - a);
    return { l: sorted[0], w: sorted[1], h: sorted[2] };
  }
  return { l: dims.length_cm, w: dims.width_cm, h: dims.height_cm };
}

/* ── Greedy layer bin-packing: same algorithm as packaging-engine.ts ── */
function fitsInBox(units: PackedUnit[], box: PudoRate): boolean {
  const remaining = [...units].sort((a, b) => b.h - a.h);
  let usedHeight = 0;

  while (remaining.length > 0) {
    const layerHeight = remaining[0].h;
    usedHeight += layerHeight;
    if (usedHeight > box.max_height_cm) return false;

    let usedL = 0, usedW = 0, rowH = 0;
    const packedIdx: number[] = [];

    for (let i = 0; i < remaining.length; i++) {
      const u = remaining[i];
      if (u.h > layerHeight) continue;

      if (usedL + u.l <= box.max_length_cm && u.w <= box.max_width_cm) {
        if (usedW + u.w <= box.max_width_cm) {
          usedL += u.l;
          rowH = Math.max(rowH, u.w);
          packedIdx.push(i);
        } else if (u.l <= box.max_length_cm && u.w <= box.max_width_cm) {
          usedW += rowH;
          usedL = u.l;
          rowH = u.w;
          if (usedW + rowH <= box.max_width_cm) packedIdx.push(i);
        }
      } else if (u.w <= box.max_length_cm && u.l <= box.max_width_cm) {
        if (usedL + u.w <= box.max_length_cm) {
          usedL += u.w;
          rowH = Math.max(rowH, u.l);
          packedIdx.push(i);
        }
      }
    }

    if (packedIdx.length === 0) return false;
    for (let i = packedIdx.length - 1; i >= 0; i--) remaining.splice(packedIdx[i], 1);
  }

  return true;
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

    /* ── 1. Load ALL Pudo rate tiers (XS -> XL), smallest first ── */
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

    const DEFAULT_DIMS: ProductDims = {
      weight_kg: 0.500,
      length_cm: 10.0,
      width_cm:  10.0,
      height_cm: 10.0,
      pack_flat: false,
    };

    const dimsMap: Record<string, ProductDims> = {};

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
              pack_flat: Boolean(p.pack_flat),
            };
          }
        }
      }
    }

    /* ── 3. Build packed units + total weight (no artificial overhead —
       stored dims are the real shipper/candle box dims, and lockers have
       been confirmed to accept a flush, zero-clearance fit) ── */
    const units: PackedUnit[] = [];
    let totalWeightKg = 0;

    for (const item of items) {
      const qty  = Math.max(1, Number(item.qty) || 1);
      const dims = dimsMap[item.productId] ?? DEFAULT_DIMS;
      const packed = getPackedDimensions(dims);

      for (let i = 0; i < qty; i++) units.push(packed);
      totalWeightKg += dims.weight_kg * qty;
    }

    totalWeightKg = Math.round(totalWeightKg * 1000) / 1000;
    const maxPackedH = units.reduce((m, u) => Math.max(m, u.h), 0);

    /* ── 4. Select smallest fitting box via real bin-packing, XS -> XL ── */
    let selectedRate: PudoRate | null = null;

    for (const rate of rates as PudoRate[]) {
      if (totalWeightKg > Number(rate.max_weight_kg)) continue;
      if (fitsInBox(units, rate)) {
        selectedRate = rate;
        break;
      }
    }

    /* ── 5. Oversized: exceeds all boxes — door delivery only ── */
    if (!selectedRate) {
      const largest = (rates as PudoRate[])[rates.length - 1];
      return new Response(
        JSON.stringify({
          oversized:       true,
          box:             null,
          locker_fee:      null,
          door_fee:        Number(largest.door_fee),
          total_weight_kg: totalWeightKg,
          max_packed_height_cm: maxPackedH,
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
        max_packed_height_cm: maxPackedH,
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
