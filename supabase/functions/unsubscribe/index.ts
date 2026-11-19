import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validUnsubscribe } from '../_shared/campaigns.mjs';

/**
 * unsubscribe: the link at the bottom of every campaign email, and one-click unsubscribe
 * (RFC 8058) from mail apps. The link carries the email and an HMAC token, so nobody can
 * unsubscribe an address they did not receive an email for.
 * Only marketing campaigns stop; order emails (confirmations, dispatch) are not affected.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function page(title: string, message: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Phenomebeauty</title>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Montserrat:wght@400;500&display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F3F1E8;color:#000;font-family:Montserrat,Helvetica,Arial,sans-serif;padding:16px}
.card{max-width:460px;background:#F2C6C2;border-radius:48px;padding:40px 32px;text-align:center}
.mark{font-family:'Abril Fatface',Georgia,serif;font-size:30px;margin:0 0 18px}h1{font-weight:500;font-size:24px;margin:0 0 12px}p{line-height:1.6;margin:0 0 18px}
a{display:inline-block;background:#000;color:#F3F1E8;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:500}</style></head>
<body><div class="card"><p class="mark">Phenomebeauty</p><h1>${title}</h1><p>${message}</p><a href="https://www.phenomebeauty.co.za">Visit the shop</a></div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get('e') || '').trim().toLowerCase();
  const token = url.searchParams.get('t') || '';
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!email || !(await validUnsubscribe(email, token, SERVICE_KEY))) {
    return page('Link not recognised', 'This unsubscribe link is incomplete. Reply to any of our emails and we will remove you by hand.', 400);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await supabase.from('email_optouts').upsert({ email, source: req.method === 'POST' ? 'one-click' : 'link' }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) return page('Something went wrong', 'We could not save that just now. Please try the link again in a minute.', 500);
  if (req.method === 'POST') return new Response(null, { status: 200 });
  return page('You are unsubscribed', 'You will not get review requests or reminders from us any more. You will still get emails about orders you place.');
});
