/**
 * pudo-locker-search
 * GET ?lat=X&lng=Y          — direct coords from Places autocomplete (preferred)
 * GET ?q=suburb+or+address  — falls back to geocoding via GOOGLE_GEOCODING_KEY
 *
 * Env vars:
 *  - PUDO_API_KEY          — Shiplogic / Pudo merchant API key
 *  - GOOGLE_GEOCODING_KEY  — server key (no referrer restriction) for Geocoding API
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

  const params = new URL(req.url).searchParams;
  const latParam = params.get('lat');
  const lngParam = params.get('lng');
  const query    = (params.get('q') ?? '').trim();

  const pudoKey    = Deno.env.get('PUDO_API_KEY')         ?? '';
  const geocodeKey = Deno.env.get('GOOGLE_GEOCODING_KEY') ?? '';

  if (!pudoKey) {
    return respond({ results: [], error: 'PUDO_API_KEY not configured' }, 200, corsHeaders);
  }

  let lat: number, lng: number;

  // ── Path A: lat/lng passed directly from Places autocomplete ─────────────
  if (latParam && lngParam) {
    lat = parseFloat(latParam);
    lng = parseFloat(lngParam);
    console.log('[pudo-locker-search] Using direct coords:', lat, lng);

  // ── Path B: geocode the text query ─────────────────────────────────
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
        console.error('[pudo-locker-search] Geocoding failed:', geoData.status, geoData.error_message ?? '');
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

  // ── Find nearest lockers via Shiplogic ──────────────────────────────
  try {
    const slUrl = `https://api.shiplogic.com/pickup-points?type=locker&lat=${lat}&lng=${lng}&order_closest=true`;
    console.log('[pudo-locker-search] Shiplogic URL:', slUrl);

    const slRes   = await fetch(slUrl, {
      headers: { 'Authorization': `Bearer ${pudoKey}`, 'Content-Type': 'application/json' },
    });
    const rawText = await slRes.text();
    console.log('[pudo-locker-search] Shiplogic status:', slRes.status);
    console.log('[pudo-locker-search] Shiplogic raw:', rawText.slice(0, 800));

    if (!slRes.ok) {
      return respond({ results: [], error: `Shiplogic ${slRes.status}`, raw: rawText.slice(0, 200) }, 200, corsHeaders);
    }

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      return respond({ results: [], error: 'Invalid JSON from Shiplogic' }, 200, corsHeaders);
    }

    console.log('[pudo-locker-search] data keys:', Object.keys(data));

    const points: any[] =
      Array.isArray(data)           ? data :
      Array.isArray(data.results)   ? data.results :
      Array.isArray(data.data)      ? data.data :
      Array.isArray(data.locations) ? data.locations : [];

    console.log('[pudo-locker-search] lockers found:', points.length);
    if (points.length > 0) console.log('[pudo-locker-search] first:', JSON.stringify(points[0]).slice(0, 400));

    const results = points.map((p: any) => ({
      id:      p.id ?? p.pickup_point_id ?? p.terminal_id ?? '',
      name:    p.name ?? p.lockerName ?? '',
      address: [
        p.address?.street_address ?? p.street ?? '',
        p.address?.local_area     ?? p.suburb ?? '',
        p.address?.city           ?? p.city   ?? '',
        p.address?.code           ?? p.postal_code ?? '',
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
