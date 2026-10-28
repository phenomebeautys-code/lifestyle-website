import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PUBLIC_PRODUCT_COLUMNS, toPublicProduct } from '../_shared/public-product.mjs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
};

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') return respond({ error: 'Method not allowed' }, 405);

  try {
    // Public table grants remain restricted. Select only storefront fields
    // and project nested options before returning service-role query results.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data, error } = await supabase
      .from('products')
      .select(PUBLIC_PRODUCT_COLUMNS)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) return respond({ error: 'Could not load products' }, 500);
    return respond((data ?? []).map(toPublicProduct));
  } catch {
    return respond({ error: 'Internal server error' }, 500);
  }
});
