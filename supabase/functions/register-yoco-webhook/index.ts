/**
 * register-yoco-webhook
 * One-time call that registers the yoco-webhook endpoint with Yoco's API
 * and returns the signing secret to save as YOCO_WEBHOOK_SECRET.
 *
 * POST body: { admin_key: string }
 *   admin_key — must match ADMIN_REGISTER_KEY env var
 */

const WEBHOOK_FUNCTION_URL =
  'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/yoco-webhook';

const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
  };

  // ── Preflight ─────────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  // ── Admin guard ───────────────────────────────────────────────────────────
  let body: { admin_key?: string };
  try {
    body = await req.json();
  } catch {
    return respond({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const adminKey      = Deno.env.get('ADMIN_REGISTER_KEY') ?? '';
  const yocoSecretKey = Deno.env.get('YOCO_SECRET_KEY')    ?? '';

  if (!adminKey) {
    return respond({ error: 'ADMIN_REGISTER_KEY env var not set' }, 500, corsHeaders);
  }
  if (body.admin_key !== adminKey) {
    return respond({ error: 'Forbidden' }, 403, corsHeaders);
  }
  if (!yocoSecretKey) {
    return respond({ error: 'YOCO_SECRET_KEY env var not set' }, 500, corsHeaders);
  }

  // ── Register webhook with Yoco ────────────────────────────────────────────
  console.log('[register-yoco-webhook] Registering:', WEBHOOK_FUNCTION_URL);

  const yocoRes = await fetch('https://payments.yoco.com/api/webhooks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${yocoSecretKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      name: 'phenomebeauty-shop',
      url:  WEBHOOK_FUNCTION_URL,
    }),
  });

  const yocoData = await yocoRes.json();
  console.log('[register-yoco-webhook] Yoco response:', yocoRes.status, JSON.stringify(yocoData));

  if (!yocoRes.ok) {
    return respond({ error: 'Yoco registration failed', detail: yocoData }, yocoRes.status, corsHeaders);
  }

  const webhookId     = yocoData.id     ?? null;
  const webhookSecret = yocoData.secret ?? null;

  if (!webhookSecret) {
    console.error('[register-yoco-webhook] No secret in Yoco response:', yocoData);
    return respond({ error: 'Yoco did not return a webhook secret', raw: yocoData }, 500, corsHeaders);
  }

  console.log('================================================');
  console.log('WEBHOOK REGISTERED ✓');
  console.log('webhook_id    :', webhookId);
  console.log('webhook_secret:', webhookSecret);
  console.log('Save as: YOCO_WEBHOOK_SECRET in yoco-webhook secrets');
  console.log('================================================');

  return respond({
    success:        true,
    webhook_id:     webhookId,
    webhook_secret: webhookSecret,
    next_step:      'Copy webhook_secret → Supabase → Edge Functions → yoco-webhook → Secrets → YOCO_WEBHOOK_SECRET',
  }, 200, corsHeaders);
});

function respond(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
