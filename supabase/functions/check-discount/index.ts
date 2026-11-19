import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CartError, trustedCart } from '../_shared/trusted-cart.mjs';
import { evaluateDiscount } from '../_shared/discounts.mjs';
import { corsOrigin } from '../_shared/site-origin.ts';

/**
 * check-discount: previews a discount code for the checkout. Read-only.
 * Body: { code, cart, email? }. The cart is re-priced from the database, as create-order does,
 * and create-order checks the code again when the order is placed.
 * Limited to 20 checks a minute per IP address so codes cannot be guessed quickly.
 */

const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.at > 60_000) { attempts.set(ip, { at: now, n: 1 }); return false; }
  a.n += 1;
  return a.n > 20;
}

Deno.serve(async req => {
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(req.headers.get('origin') || ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
    'Content-Type': 'application/json',
  };
  const respond = (data, status = 200) => new Response(JSON.stringify(data), {status, headers});
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') return respond({error: 'Method not allowed'}, 405);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) return respond({ok: false, error: 'Too many attempts. Wait a minute and try again.'}, 429);
  let body;
  try { body = await req.json(); } catch { return respond({error: 'Invalid JSON'}, 400); }
  try {
    const {code, cart, email} = body || {};
    if (!Array.isArray(cart) || !cart.length || cart.length > 100) return respond({ok: false, error: 'Your cart is empty.'}, 400);
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const ids = [...new Set(cart.map(item => item?.productId || item?.id))];
    if (ids.some(id => typeof id !== 'string' || !id)) return respond({ok: false, error: 'Invalid product'}, 400);
    const {data: products, error} = await supabase.from('products')
      .select('id, name, price, variants, sizes, image_url, active, availability').in('id', ids);
    if (error || !products) return respond({ok: false, error: 'Could not check your cart. Please retry.'}, 503);
    const trusted = trustedCart(cart, products);
    const result = await evaluateDiscount(supabase, code, trusted.subtotalCents, email);
    if (!result.ok) return respond({ok: false, error: result.error});
    return respond({ok: true, code: result.code, kind: result.kind, label: result.label,
      discount: result.discountCents / 100, free_delivery: result.freeDelivery, subtotal: trusted.subtotalCents / 100});
  } catch (error) {
    if (error instanceof CartError) return respond({ok: false, error: error.message}, 409);
    return respond({ok: false, error: 'Could not check the code. Please retry.'}, 503);
  }
});
