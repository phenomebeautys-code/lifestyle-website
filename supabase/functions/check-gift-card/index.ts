import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normaliseGiftCode } from '../_shared/gift-cards.mjs';
import { corsOrigin } from '../_shared/site-origin.ts';

/**
 * check-gift-card: shows a gift card's balance at checkout. Read-only; nothing is held here.
 * create-order holds the amount when the order is placed. Limited to 10 checks a minute per IP.
 */

const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.at > 60_000) { attempts.set(ip, { at: now, n: 1 }); return false; }
  a.n += 1;
  return a.n > 10;
}

Deno.serve(async req => {
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(req.headers.get('origin') || ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
    'Content-Type': 'application/json',
  };
  const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) return respond({ ok: false, error: 'Too many attempts. Wait a minute and try again.' }, 429);
  let body;
  try { body = await req.json(); } catch { return respond({ ok: false, error: 'Invalid JSON' }, 400); }
  const code = normaliseGiftCode(body?.code);
  if (!code) return respond({ ok: false, error: 'Gift card codes look like PB-XXXX-XXXX-XXXX.' });
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: card, error } = await supabase.from('gift_cards').select('code, balance, expires_at, status').eq('code', code).maybeSingle();
  if (error) return respond({ ok: false, error: 'Gift cards are unavailable right now. Please try again.' }, 503);
  if (!card) return respond({ ok: false, error: 'We could not find that gift card. Check the code and try again.' });
  if (card.status !== 'active') return respond({ ok: false, error: 'This gift card cannot be used. Please contact us.' });
  if (new Date(card.expires_at) <= new Date()) return respond({ ok: false, error: 'This gift card has expired.' });
  if (!(Number(card.balance) > 0)) return respond({ ok: false, error: 'This gift card has no balance left.' });
  return respond({ ok: true, code: card.code, balance: Number(card.balance), expires_at: card.expires_at });
});
