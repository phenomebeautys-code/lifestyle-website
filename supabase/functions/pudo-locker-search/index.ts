/**
 * pudo-locker-search
 * GET ?lat=X&lng=Y          — direct coords from Places autocomplete (preferred)
 * GET ?q=suburb+or+address  — falls back to geocoding via GOOGLE_GEOCODING_KEY
 *
 * Env vars:
 *  - PUDO_API_KEY          — Pudo merchant API key (from customer.pudo.co.za Settings > API Keys)
 *  - GOOGLE_GEOCODING_KEY  — server-side Google Geocoding API key (no referrer restriction)
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

  const params   = new URL(req.url).searchParams;
  const latParam = params.get('lat');
  const lngParam = params.get('lng');
  const query    = (params.get('q') ?? '').trim();

  const pudoKey    = Deno.env.get('PUDO_API_KEY')         ?? '';
  const geocodeKey = Deno.env.get('GOOGLE_GEOCODING_KEY') ?? '';

  if (!pudoKey) {
    return respond({ results: [], error: 'PUDO_API_KEY not configured' }, 200, corsHeaders);
  }

  let lat: number, lng: number;

  // ── Path A: lat/lng passed directly from Places autocomplete ──────────────
  if (latParam && lngParam) {
    lat = parseFloat(latParam);
    lng = parseFloat(lngParam);
    console.log('[pudo-locker-search] Using direct coords:', lat, lng);

  // ── Path B: geocode the text query ────────────────────────────────────────
  } else if (query) {
    if (!geocodeKey) {
      return respond({ results: [], error: 'GOOGLE_GEOCODING_KEY not configured' }, 200, corsHeaders);
    }
    console.log('[pudo-locker-search] Geocoding query:', query);
    try {
      const geoRes  = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query + ', South Africa')}&components=country:ZA&key=${geocodeKey}`
      );
      const geoData = await geoRes.json();
      if (geoData.status !== 'OK' || !geoData.results?.length) {
        console.error('[pudo-locker-search] Geocoding failed:', geoData.status);
        return respond({ results: [], error: `Could not locate "${query}"` }, 200, corsHeaders);
      }
      lat = geoData.results[0].geometry.location.lat;
      lng = geoData.results[0].geometry.location.lng;
      console.log('[pudo-locker-search] Geocoded to:', lat, lng);
    } catch (err) {
      console.error('[pudo-locker-search] Geocoding error:', err);
      return respond({ results: [], error: 'Geocoding failed' }, 200, corsHeaders);
    }
  } else {
    return respond({ results: [] }, 200, corsHeaders);
  }

  // ── Find nearest Pudo lockers ─────────────────────────────────────────────
  try {
    // Pudo service-points endpoint — returns lockers sorted by distance when lat/lng provided
    const pudoUrl = `https://api-pudo.co.za/service-points?lat=${lat}&lng=${lng}&type=locker`;
    console.log('[pudo-locker-search] Pudo URL:', pudoUrl);

    const pudoRes  = await fetch(pudoUrl, {
      headers: {
        'Authorization': `Bearer ${pudoKey}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
    });
    const rawText = await pudoRes.text();
    console.log('[pudo-locker-search] Pudo status:', pudoRes.status);
    console.log('[pudo-locker-search] Pudo raw:', rawText.slice(0, 800));

    if (!pudoRes.ok) {
      return respond({ results: [], error: `Pudo API ${pudoRes.status}`, raw: rawText.slice(0, 200) }, 200, corsHeaders);
    }

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      return respond({ results: [], error: 'Invalid JSON from Pudo API' }, 200, corsHeaders);
    }

    console.log('[pudo-locker-search] data type:', Array.isArray(data) ? 'array' : typeof data);
    console.log('[pudo-locker-search] data keys:', Array.isArray(data) ? 'N/A' : Object.keys(data));

    // Pudo may return array directly or nested under a key
    const points: any[] =
      Array.isArray(data)                  ? data :
      Array.isArray(data.service_points)   ? data.service_points :
      Array.isArray(data.results)          ? data.results :
      Array.isArray(data.data)             ? data.data :
      Array.isArray(data.locations)        ? data.locations : [];

    console.log('[pudo-locker-search] lockers found:', points.length);
    if (points.length > 0) console.log('[pudo-locker-search] first locker:', JSON.stringify(points[0]).slice(0, 400));

    const results = points.slice(0, 10).map((p: any) => ({
      id:      p.terminal_id ?? p.id ?? p.service_point_id ?? '',
      name:    p.name ?? p.terminal_name ?? p.lockerName ?? '',
      address: [
        p.street_address ?? p.address?.street_address ?? p.street ?? '',
        p.local_area     ?? p.address?.local_area     ?? p.suburb ?? '',
        p.city           ?? p.address?.city           ?? '',
        p.code           ?? p.address?.code           ?? p.postal_code ?? '',
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
