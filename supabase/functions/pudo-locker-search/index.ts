/**
 * pudo-locker-search
 * Searches TCG Locker terminals by suburb/name using the official TCG API.
 * GET ?q=suburb
 *
 * Docs: https://api-tcg.co.za (TCG Locker Production API)
 * Auth: Bearer token from PUDO_API_KEY secret
 */

const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const corsHeaders = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url   = new URL(req.url);
  const query = (url.searchParams.get('q') ?? '').trim();

  if (!query) {
    return respond({ results: [] }, 200, corsHeaders);
  }

  const apiKey = Deno.env.get('PUDO_API_KEY') ?? '';
  if (!apiKey) {
    console.error('[pudo-locker-search] PUDO_API_KEY not set');
    return respond({ results: [], error: 'PUDO_API_KEY not configured' }, 200, corsHeaders);
  }

  try {
    // TCG Locker terminals endpoint — search by suburb or terminal name
    const endpoint = `https://api-tcg.co.za/terminals?search=${encodeURIComponent(query)}`;
    console.log('[pudo-locker-search] Calling:', endpoint);

    const res = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
    });

    const rawText = await res.text();
    console.log('[pudo-locker-search] HTTP status:', res.status);
    console.log('[pudo-locker-search] Raw response:', rawText.slice(0, 1000));

    if (!res.ok) {
      return respond({ results: [], error: `TCG API ${res.status}`, raw: rawText.slice(0, 200) }, 200, corsHeaders);
    }

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      return respond({ results: [], error: 'Invalid JSON from TCG API' }, 200, corsHeaders);
    }

    console.log('[pudo-locker-search] data keys:', Object.keys(data));

    // TCG API returns { terminals: [...] } or a flat array
    const terminals: any[] =
      Array.isArray(data)               ? data :
      Array.isArray(data.terminals)     ? data.terminals :
      Array.isArray(data.results)       ? data.results :
      Array.isArray(data.data)          ? data.data : [];

    console.log('[pudo-locker-search] terminals found:', terminals.length);
    if (terminals.length > 0) {
      console.log('[pudo-locker-search] first terminal:', JSON.stringify(terminals[0]).slice(0, 400));
    }

    const results = terminals.map((t: any) => ({
      // terminal_id (e.g. "CG63") is used in delivery_address when creating shipments
      id:      t.terminal_id  ?? t.id     ?? t.lockerCode ?? '',
      name:    t.name         ?? t.lockerName ?? '',
      address: [
        t.street_address ?? t.address?.street_address ?? '',
        t.local_area     ?? t.suburb ?? t.address?.local_area ?? '',
        t.city           ?? t.address?.city ?? '',
        t.postal_code    ?? t.code   ?? t.address?.code ?? '',
      ].filter(Boolean).join(', '),
    }));

    return respond({ results }, 200, corsHeaders);

  } catch (err) {
    console.error('[pudo-locker-search] Unexpected error:', err);
    return respond({ results: [], error: String(err) }, 200, corsHeaders);
  }
});

function respond(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
