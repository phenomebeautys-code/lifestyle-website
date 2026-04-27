/**
 * pudo-locker-search
 * GET ?lat=X&lng=Y          — direct coords (preferred, from Places autocomplete)
 * GET ?q=suburb+or+address  — falls back to geocoding via GOOGLE_GEOCODING_KEY
 *
 * Confirmed endpoint: GET https://api-pudo.co.za/api/v1/lockers-data
 * Authorization: Bearer <PUDO_API_KEY>
 *
 * Fetches all lockers, computes Haversine distance, returns 10 nearest.
 *
 * Env vars:
 *  - PUDO_API_KEY          — Pudo/TCG API key (customer.pudo.co.za > Settings > API Keys)
 *  - GOOGLE_GEOCODING_KEY  — server-side Google Geocoding API key
 */

const ALLOWED_ORIGINS = [
  'https://www.phenomebeauty.co.za',
  'https://phenomebeauty.co.za',
];

/** Haversine distance in km */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

  // ── Path A: lat/lng passed directly ───────────────────────────────────────
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

  // ── Fetch all Pudo lockers from confirmed endpoint ────────────────────────
  const LOCKERS_URL = 'https://api-pudo.co.za/api/v1/lockers-data';
  console.log('[pudo-locker-search] Fetching:', LOCKERS_URL);

  try {
    const lockersRes = await fetch(LOCKERS_URL, {
      headers: {
        'Authorization':  `Bearer ${pudoKey}`,
        'Accept':         'application/json',
        'Content-Type':   'application/json',
        'requested-from': 'portal',
      },
    });

    const rawText = await lockersRes.text();
    console.log('[pudo-locker-search] Status:', lockersRes.status);
    console.log('[pudo-locker-search] Raw (first 600):', rawText.slice(0, 600));

    if (!lockersRes.ok) {
      return respond(
        { results: [], error: `Pudo API returned ${lockersRes.status}`, raw: rawText.slice(0, 300) },
        200,
        corsHeaders
      );
    }

    let lockers: any[];
    try {
      const parsed = JSON.parse(rawText);
      lockers = Array.isArray(parsed)         ? parsed
              : Array.isArray(parsed.data)    ? parsed.data
              : Array.isArray(parsed.lockers) ? parsed.lockers
              : [];
    } catch {
      return respond({ results: [], error: 'Invalid JSON from Pudo API' }, 200, corsHeaders);
    }

    console.log('[pudo-locker-search] Total lockers:', lockers.length);
    if (lockers.length > 0) {
      console.log('[pudo-locker-search] First locker keys:', Object.keys(lockers[0]));
      console.log('[pudo-locker-search] First locker sample:', JSON.stringify(lockers[0]).slice(0, 400));
    }

    // Compute distance, sort ascending, return 10 nearest
    const withDistance = lockers
      .filter((l: any) => l.latitude && l.longitude)
      .map((l: any) => ({
        ...l,
        _distKm: distanceKm(lat, lng, parseFloat(l.latitude), parseFloat(l.longitude)),
      }))
      .sort((a: any, b: any) => a._distKm - b._distKm);

    const results = withDistance.slice(0, 10).map((l: any) => ({
      id:          l.code ?? l.terminal_id ?? l.id ?? '',
      name:        l.name ?? '',
      address:     l.address ?? '',
      town:        l.place?.town ?? '',
      postal_code: l.place?.postalCode ?? '',
      distance_km: Math.round(l._distKm * 10) / 10,
      opening_hours: (l.openinghours ?? []).map((h: any) => ({
        day:   h.day?.trim(),
        open:  h.open_time,
        close: h.close_time,
      })),
    }));

    console.log('[pudo-locker-search] Returning', results.length, 'nearest lockers');
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
