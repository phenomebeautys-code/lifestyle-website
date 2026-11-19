import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadFreeDelivery } from '../_shared/free-delivery.mjs';
import { loadGiftSettings } from '../_shared/gift-cards.mjs';
import { corsOrigin } from '../_shared/site-origin.ts';

/**
 * shop-config: public, read-only shop settings for the cart and checkout.
 * Currently the free-delivery rule. The server applies the same rule in create-order,
 * so this is only for showing "Add R X more for free delivery".
 */

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

Deno.serve(async (req: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(req.headers.get('origin') ?? ''),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60',
    'Vary': 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  const [freeDelivery, giftCards] = await Promise.all([loadFreeDelivery(supabase), loadGiftSettings(supabase)]);
  return new Response(JSON.stringify({ free_delivery: freeDelivery, gift_cards: giftCards }), { status: 200, headers });
});
