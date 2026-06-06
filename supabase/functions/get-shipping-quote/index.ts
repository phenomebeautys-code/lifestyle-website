import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ============================================================
   get-shipping-quote
   Accepts: POST { items: [{ productId, qty }] }
   Returns: { box, locker_fee, door_fee, total_weight_kg }

   Box selection logic:
   - Each product is assumed to weigh 0.5 kg unless a weight is
     found in the public.products table.
   - The smallest Pudo box that fits the total weight is selected
     from public.pudo_rates.
   - If no box fits (order > 20 kg) the XL rate is used.
   ============================================================ */

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')       ?? '';
const SUPABASE_ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY')  ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? SUPABASE_ANON_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
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

    // ------------------------------------------------------------------
    // 1. Attempt to look up product weights from public.products.
    //    If the table does not exist or has no weight column we fall back
    //    to the default weight per item.
    // ------------------------------------------------------------------
    const DEFAULT_WEIGHT_KG = 0.5;
    let totalWeightKg = 0;

    const productIds = items
      .map(i => i.productId)
      .filter(id => typeof id === 'string' && id.length > 0);

    let weightMap: Record<string, number> = {};

    if (productIds.length > 0) {
      try {
        const { data: products } = await supabase
          .from('products')
          .select('id, weight_kg')
          .in('id', productIds);

        if (Array.isArray(products)) {
          for (const p of products) {
            if (p.id && typeof p.weight_kg === 'number' && p.weight_kg > 0) {
              weightMap[p.id] = p.weight_kg;
            }
          }
        }
      } catch (_) {
        // Table may not have weight_kg column -- fall through to defaults
      }
    }

    for (const item of items) {
      const weight = weightMap[item.productId] ?? DEFAULT_WEIGHT_KG;
      totalWeightKg += weight * (Number(item.qty) || 1);
    }

    // ------------------------------------------------------------------
    // 2. Find the smallest Pudo box that fits the total weight.
    // ------------------------------------------------------------------
    const { data: rates, error: ratesError } = await supabase
      .from('pudo_rates')
      .select('box_size, max_weight_kg, locker_fee, door_fee')
      .order('max_weight_kg', { ascending: true });

    if (ratesError || !Array.isArray(rates) || rates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Could not load shipping rates. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Pick the first box whose max_weight_kg >= totalWeightKg
    let selectedRate = rates[rates.length - 1]; // default to largest
    for (const rate of rates) {
      if (Number(rate.max_weight_kg) >= totalWeightKg) {
        selectedRate = rate;
        break;
      }
    }

    const response = {
      box:              selectedRate.box_size,
      locker_fee:       Number(selectedRate.locker_fee),
      door_fee:         Number(selectedRate.door_fee),
      total_weight_kg:  Math.round(totalWeightKg * 1000) / 1000,
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
