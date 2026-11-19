import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildFeedItems, googleFeedXml } from '../_shared/product-feed.mjs';

/**
 * product-feed: the shop's products for Google Merchant Center (free listings and Shopping ads).
 *
 *   GET /functions/v1/product-feed                 Google product feed (RSS 2.0 XML)
 *   GET /functions/v1/product-feed?format=json     the same items as JSON, for the admin preview
 *
 * Public and read-only: it lists only what the shop already shows. Each scent or type is its own
 * item, grouped by product. Products that are coming soon or have no price are left out.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await supabase.from('products')
    .select('id, name, price, brand, category, description, image_url, image_urls, variants, sizes, active, availability, sort_order, collection, market')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) return new Response('Feed unavailable', { status: 503 });
  const { items, skipped } = buildFeedItems(data ?? []);
  const format = new URL(req.url).searchParams.get('format');
  if (format === 'json') {
    return new Response(JSON.stringify({ items, skipped, generated_at: new Date().toISOString() }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(googleFeedXml(items), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
  });
});
