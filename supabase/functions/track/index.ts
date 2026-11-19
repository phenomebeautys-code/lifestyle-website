import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isSiteOrigin } from '../_shared/site-origin.ts';

/**
 * track: receives anonymous visit events from track.js on the public site.
 *
 * Stores no names, emails or IP addresses. A visit is a random id the browser keeps for the tab.
 * Accepts only requests from the site itself, drops obvious bots, and limits each IP address
 * (held in memory only) to a modest number of events per minute.
 * The body is sent as text/plain by navigator.sendBeacon, so there is no CORS preflight.
 */

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const EVENTS   = ['page_view', 'product_view', 'add_to_cart', 'checkout_start'];
const CHANNELS = ['direct', 'search', 'social', 'email', 'paid', 'referral', 'whatsapp'];
const DEVICES  = ['mobile', 'tablet', 'desktop'];
const BOTS     = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch/i;
const UUID     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION  = /^[A-Za-z0-9_-]{8,64}$/;

const hits = new Map<string, { count: number; firstAt: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.firstAt > 60_000) { hits.set(ip, { count: 1, firstAt: now }); return false; }
  h.count++;
  return h.count > 120;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().slice(0, max);
  return v || null;
}

function pick<T extends string>(value: unknown, allowed: T[]): T | null {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? value as T : null;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = { 'Access-Control-Allow-Origin': isSiteOrigin(origin) ? origin : 'https://www.phenomebeauty.co.za', 'Vary': 'Origin' };
  const done = (status = 204) => new Response(null, { status, headers: cors });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type' } });
  if (req.method !== 'POST') return done(405);
  if (!isSiteOrigin(origin)) return done(403);
  if (BOTS.test(req.headers.get('user-agent') ?? '')) return done();

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (tooMany(ip)) return done(429);

  let raw: string;
  try { raw = await req.text(); } catch { return done(400); }
  if (raw.length > 4000) return done(413);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = JSON.parse(raw); } catch { return done(400); }

  const list = Array.isArray(body?.events) ? body.events.slice(0, 20) : [];
  const sessionId = typeof body?.session_id === 'string' && SESSION.test(body.session_id) ? body.session_id : null;
  if (!sessionId || !list.length) return done(400);

  const visit = body.visit && typeof body.visit === 'object' ? body.visit : {};
  const rows = [];
  for (const e of list) {
    const event = pick(e?.event, EVENTS);
    if (!event) continue;
    rows.push({
      session_id:   sessionId,
      event,
      path:         text(e.path, 200),
      product_id:   text(e.product_id, 64),
      order_id:     typeof e.order_id === 'string' && UUID.test(e.order_id) ? e.order_id : null,
      channel:      pick(visit.channel, CHANNELS),
      source:       text(visit.source, 80),
      campaign:     text(visit.campaign, 80),
      landing_path: text(visit.landing_path, 200),
      device:       pick(visit.device, DEVICES),
    });
  }
  if (!rows.length) return done(400);

  const { error } = await supabase.from('site_events').insert(rows);
  if (error) {
    console.error('[track] insert failed:', error.message);
    return done(500);
  }
  return done();
});
