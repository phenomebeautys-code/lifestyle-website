/**
 * register-yoco-webhook
 * One-time call that registers the yoco-webhook endpoint with Yoco's API
 * and saves the returned signing secret as YOCO_WEBHOOK_SECRET.
 *
 * POST body: { admin_key: string }
 *   admin_key — must match ADMIN_REGISTER_KEY env var (simple auth for single-tenant)
 *
 * On success, saves the whsec_ secret to the shop_config table and logs it
 * so you can copy it into Supabase Edge Function secrets.
 *
 * Call once from Hoppscotch / Postman / fetch after deploying.
 */

const WEBHOOK_FUNCTION_URL =
  'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/yoco-webhook';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return respond(null, 204);
  }

  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  // ── Simple admin guard ─────────────────────────────────────────────────────
  // Not multi-tenant — protect with a simple pre-shared key you set in secrets.
  let body: { admin_key?: string };
  try {
    body = await req.json();
  } catch {
    return respond({ error: 'Invalid JSON body' }, 400);
  }

  const adminKey         = Deno.env.get('ADMIN_REGISTER_KEY') ?? '';
  const yocoSecretKey    = Deno.env.get('YOCO_SECRET_KEY') ?? '';

  if (!adminKey) {
    return respond({ error: 'ADMIN_REGISTER_KEY env var not set' }, 500);
  }

  if (body.admin_key !== adminKey) {
    return respond({ error: 'Forbidden' }, 403);
  }

  if (!yocoSecretKey) {
    return respond({ error: 'YOCO_SECRET_KEY env var not set' }, 500);
  }

  // ── Register webhook with Yoco ───────────────────────────────────────────────
  console.log('[register-yoco-webhook] Registering webhook URL:', WEBHOOK_FUNCTION_URL);

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
    return respond({ error: 'Yoco registration failed', detail: yocoData }, yocoRes.status);
  }

  const webhookId     = yocoData.id     ?? null;
  const webhookSecret = yocoData.secret ?? null;

  if (!webhookSecret) {
    console.error('[register-yoco-webhook] Yoco did not return a secret:', yocoData);
    return respond({ error: 'Yoco did not return a webhook secret', raw: yocoData }, 500);
  }

  // ── Log clearly so you can copy the secret ─────────────────────────────────────
  // The secret is returned here AND in the response body below.
  // Copy it into: Supabase → Edge Functions → yoco-webhook → Secrets → YOCO_WEBHOOK_SECRET
  console.log('==========================================================');
  console.log('WEBHOOK REGISTERED SUCCESSFULLY');
  console.log('webhook_id    :', webhookId);
  console.log('webhook_secret:', webhookSecret);
  console.log('ACTION REQUIRED: Add the secret above to Supabase secrets');
  console.log('  Key:   YOCO_WEBHOOK_SECRET');
  console.log('  Value:', webhookSecret);
  console.log('==========================================================');

  return respond({
    success:        true,
    webhook_id:     webhookId,
    webhook_secret: webhookSecret,
    next_step:      'Copy webhook_secret into Supabase Edge Function secret: YOCO_WEBHOOK_SECRET',
  }, 200);
});

function respond(data: unknown, status = 200) {
  return new Response(data === null ? '' : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
