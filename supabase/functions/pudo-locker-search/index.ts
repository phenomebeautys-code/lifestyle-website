const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url   = new URL(req.url);
  const query = url.searchParams.get('q') || '';

  if (!query.trim()) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const apiKey = Deno.env.get('PUDO_API_KEY') ?? '';
  console.log('[pudo-locker-search] apiKey present:', !!apiKey, '| query:', query);

  if (!apiKey) {
    return new Response(JSON.stringify({ results: [], error: 'PUDO_API_KEY not set' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const endpoint = `https://api.shiplogic.com/pickup-points?type=locker&search=${encodeURIComponent(query)}`;
    console.log('[pudo-locker-search] Calling:', endpoint);

    const res = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const rawText = await res.text();
    console.log('[pudo-locker-search] HTTP status:', res.status);
    console.log('[pudo-locker-search] Raw response:', rawText.slice(0, 2000));

    if (!res.ok) {
      return new Response(JSON.stringify({ results: [], error: `API ${res.status}`, raw: rawText }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      console.error('[pudo-locker-search] JSON parse failed:', rawText.slice(0, 500));
      return new Response(JSON.stringify({ results: [], error: 'Invalid JSON from Shiplogic', raw: rawText.slice(0,500) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Log the top-level keys so we know the real shape
    console.log('[pudo-locker-search] data keys:', Object.keys(data));
    if (Array.isArray(data)) {
      console.log('[pudo-locker-search] data is array, length:', data.length);
    }

    // Handle both { results: [...] } and flat array responses
    const pickupPoints: any[] =
      Array.isArray(data)          ? data         :
      Array.isArray(data.results)  ? data.results :
      Array.isArray(data.data)     ? data.data    :
      Array.isArray(data.locations)? data.locations: [];

    console.log('[pudo-locker-search] pickupPoints count:', pickupPoints.length);
    if (pickupPoints.length > 0) {
      console.log('[pudo-locker-search] first item keys:', Object.keys(pickupPoints[0]));
      console.log('[pudo-locker-search] first item:', JSON.stringify(pickupPoints[0]).slice(0, 500));
    }

    const results = pickupPoints.map((p: any) => ({
      id:      p.id ?? p.pickup_point_id ?? p.lockerCode ?? '',
      name:    p.name ?? p.lockerName ?? '',
      address: [
        p.address?.street_address ?? p.address?.street ?? p.street ?? '',
        p.address?.local_area     ?? p.suburb ?? '',
        p.address?.city           ?? p.city   ?? '',
        p.address?.code           ?? p.postal_code ?? '',
      ].filter(Boolean).join(', '),
    }));

    return new Response(JSON.stringify({ results, _debug_count: pickupPoints.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders },
    });

  } catch (err) {
    console.error('[pudo-locker-search] Unexpected error:', err);
    return new Response(JSON.stringify({ results: [], error: String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
