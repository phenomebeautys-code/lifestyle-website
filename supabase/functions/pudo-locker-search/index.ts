/**
 * pudo-locker-search
 * GET ?lat=X&lng=Y          — direct coords (preferred, from Places autocomplete)
 * GET ?q=suburb+or+address  — falls back to geocoding via GOOGLE_GEOCODING_KEY
 *
 * Fetches all Pudo lockers from /api/v1/get-lockers, computes Haversine distance,
 * returns the 10 nearest to the user's coords.
 *
 * Env vars:
 *  - PUDO_API_KEY          — Pudo merchant API key (customer.pudo.co.za > Settings > API Keys)
 *  - GOOGLE_GEOCODING_KEY  — server-side Google Geocoding API key (no referrer restriction)
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

  // ── Fetch all Pudo lockers ─────────────────────────────────────────────────
  // The portal uses /api/v1/ as the base — try get-lockers endpoint
  const candidates = [
    'https://api-pudo.co.za/api/v1/get-lockers',
    'https://api-pudo.co.za/api/v1/lockers',
    'https://api-pudo.co.za/api/v1/lockers-data',
  ];

  let lockers: any[] = [];
  let successUrl = '';

  for (const url of candidates) {
    console.log('[pudo-locker-search] Trying:', url);
    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${pudoKey}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
          'requested-from': 'portal',
        },
      });
      const text = await res.text();
      console.log('[pudo-locker-search] Status:', res.status, '| Raw (first 400):', text.slice(0, 400));

      if (res.ok) {
        const parsed = JSON.parse(text);
        lockers = Array.isArray(parsed) ? parsed
          : Array.isArray(parsed.data)    ? parsed.data
          : Array.isArray(parsed.lockers) ? parsed.lockers
          : [];
        successUrl = url;
        break;
      }
    } catch (err) {
      console.error('[pudo-locker-search] Error trying', url, err);
    }
  }

  if (!lockers.length) {
    return respond({ results: [], error: 'Could not load locker list from any known endpoint', tried: candidates }, 200, corsHeaders);
  }

  console.log('[pudo-locker-search] Loaded', lockers.length, 'lockers from', successUrl);
  if (lockers.length > 0) {
    console.log('[pudo-locker-search] First locker keys:', Object.keys(lockers[0]));
    console.log('[pudo-locker-search] First locker sample:', JSON.stringify(lockers[0]).slice(0, 400));
  }

  // Compute distance and return 10 nearest
  const withDistance = lockers
    .filter((l: any) => l.latitude && l.longitude)
    .map((l: any) => ({
      ...l,
      _distKm: distanceKm(lat, lng, parseFloat(l.latitude), parseFloat(l.longitude)),
    }))
    .sort((a: any, b: any) => a._distKm - b._distKm);

  const results = withDistance.slice(0, 10).map((l: any) => ({
    id:          l.code ?? l.terminal_id ?? l.id ?? '',
    name:        l.name ?? l.terminal_name ?? '',
    address:     l.address ?? '',
    town:        l.place?.town ?? l.town ?? '',
    postal_code: l.place?.postalCode ?? l.postal_code ?? '',
    distance_km: Math.round(l._distKm * 10) / 10,
    opening_hours: (l.openinghours ?? l.opening_hours ?? []).map((h: any) => ({
      day:   h.day?.trim(),
      open:  h.open_time,
      close: h.close_time,
    })),
  }));

  console.log('[pudo-locker-search] Returning', results.length, 'nearest lockers');
  return respond({ results }, 200, corsHeaders);
});

function respond(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
