import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_PASSWORD   = Deno.env.get('SHOP_ADMIN_PASSWORD') ?? '';
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ALLOWED_ORIGINS = [
  'https://phenomebeauty.co.za',
  'https://www.phenomebeauty.co.za',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

/* ── Rate limiting ──────────────────────────────────────── */
const loginAttempts = new Map<string, { count: number; firstAt: number }>();
const RATE_LIMIT    = 5;
const RATE_WINDOW   = 60_000;

function isRateLimited(ip: string): boolean {
  const now    = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAt > RATE_WINDOW) {
    loginAttempts.set(ip, { count: 1, firstAt: now });
    return false;
  }
  record.count++;
  return record.count > RATE_LIMIT;
}

/* ── Helpers ────────────────────────────────────────────── */
function json(data: unknown, status = 200, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
function unauthorized(cors: Record<string, string>) {
  return json({ error: 'Unauthorized' }, 401, cors);
}

/* ── Main handler ───────────────────────────────────────── */
Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method Not Allowed', { status: 405 });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown';

  let body: {
    action?: string;
    password?: string;
    order_id?: string;
    status?: string;
    product?: Record<string, unknown>;
    product_id?: string;
  };
  try { body = await req.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400, cors);
  }

  const { action, password } = body;

  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many attempts. Try again in 60 seconds.' }),
      { status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' } }
    );
  }

  if (!password || password.length !== ADMIN_PASSWORD.length) return unauthorized(cors);
  let mismatch = 0;
  for (let i = 0; i < ADMIN_PASSWORD.length; i++) {
    mismatch |= password.charCodeAt(i) ^ ADMIN_PASSWORD.charCodeAt(i);
  }
  if (mismatch !== 0) return unauthorized(cors);

  loginAttempts.delete(ip);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  /* ── get_orders ─────────────────────────────────────────── */
  if (action === 'get_orders') {
    const { data, error } = await supabase
      .from('shop_orders')
      .select('id, created_at, customer_name, customer_email, customer_phone, delivery_address, delivery_method, delivery_meta, items, subtotal, delivery_fee, total_amount, payment_status, payment_id, paid_at, status, is_gift, gift_message, notes')
      .order('created_at', { ascending: false });

    if (error) return json({ error: error.message }, 500, cors);
    return json({ orders: data }, 200, cors);
  }

  /* ── update_status ──────────────────────────────────────── */
  if (action === 'update_status') {
    const { order_id, status } = body;
    const allowed = ['pending', 'processing', 'dispatched', 'delivered'];

    if (!order_id)                            return json({ error: 'Missing order_id' }, 400, cors);
    if (!status || !allowed.includes(status)) return json({ error: 'Invalid status' }, 400, cors);

    const { error } = await supabase
      .from('shop_orders')
      .update({ status })
      .eq('id', order_id);

    if (error) return json({ error: error.message }, 500, cors);
    return json({ ok: true }, 200, cors);
  }

  /* ── get_products ───────────────────────────────────────── */
  if (action === 'get_products') {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('idx', { ascending: true });

    if (error) return json({ error: error.message }, 500, cors);
    return json({ products: data }, 200, cors);
  }

  /* ── add_product ────────────────────────────────────────── */
  if (action === 'add_product') {
    const p = body.product;
    if (!p || !p.name) return json({ error: 'Missing product name' }, 400, cors);

    const { data, error } = await supabase
      .from('products')
      .insert({
        name:        p.name,
        price:       p.price       ?? 0,
        cost_price:  p.cost_price  ?? 0,
        sku:         p.sku         ?? '',
        brand:       p.brand       ?? '',
        description: p.description ?? '',
        image_url:   p.image_url   ?? '',
        image_urls:  p.image_urls  ?? [],
        category:    p.category    ?? '',
        variants:    p.variants    ?? [],
        sizes:       p.sizes       ?? [],
        active:      true,
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500, cors);
    return json({ product: data }, 200, cors);
  }

  /* ── update_product ─────────────────────────────────────── */
  if (action === 'update_product') {
    const p = body.product;
    if (!p || !p.id)   return json({ error: 'Missing product id' }, 400, cors);
    if (!p.name)       return json({ error: 'Missing product name' }, 400, cors);

    const { data, error } = await supabase
      .from('products')
      .update({
        name:        p.name,
        price:       p.price       ?? 0,
        cost_price:  p.cost_price  ?? 0,
        sku:         p.sku         ?? '',
        brand:       p.brand       ?? '',
        description: p.description ?? '',
        image_url:   p.image_url   ?? '',
        image_urls:  p.image_urls  ?? [],
        category:    p.category    ?? '',
        variants:    p.variants    ?? [],
        sizes:       p.sizes       ?? [],
        active:      p.active      ?? true,
      })
      .eq('id', p.id)
      .select()
      .single();

    if (error) return json({ error: error.message }, 500, cors);
    return json({ product: data }, 200, cors);
  }

  /* ── delete_product ─────────────────────────────────────── */
  if (action === 'delete_product') {
    const { product_id } = body;
    if (!product_id) return json({ error: 'Missing product_id' }, 400, cors);

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', product_id);

    if (error) return json({ error: error.message }, 500, cors);
    return json({ ok: true }, 200, cors);
  }

  return json({ error: 'Unknown action' }, 400, cors);
});
