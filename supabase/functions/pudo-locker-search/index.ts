/**
 * pudo-locker-search
 * GET ?q=suburb+or+address
 *
 * Flow:
 *  1. Geocode the query to lat/lng using Google Maps Geocoding API
 *  2. Call Shiplogic pickup-points with lat/lng + order_closest=true
 *  3. Return the 20 nearest Pudo lockers
 *
 * Env vars required:
 *  - PUDO_API_KEY           — Shiplogic / Pudo merchant API key
 *  - GOOGLE_PLACES_API_KEY  — reused from get-places-key secret
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

  const pudoKey   = Deno.env.get('PUDO_API_KEY')          ?? '';
  const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';

  if (!pudoKey) {
    console.error('[pudo-locker-search] PUDO_API_KEY not set');
    return respond({ results: [], error: 'PUDO_API_KEY not configured' }, 200, corsHeaders);
  }
  if (!googleKey) {
    console.error('[pudo-locker-search] GOOGLE_PLACES_API_KEY not set');
    return respond({ results: [], error: 'GOOGLE_PLACES_API_KEY not configured' }, 200, corsHeaders);
  }

  try {
    // ── Step 1: Geocode the query to lat/lng ────────────────────────────
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query + ', South Africa')}&key=${googleKey}&components=country:ZA`;
    console.log('[pudo-locker-search] Geocoding:', query);

    const geoRes  = await fetch(geocodeUrl);
    const geoData = await geoRes.json();

    if (geoData.status !== 'OK' || !geoData.results?.length) {
      console.error('[pudo-locker-search] Geocoding failed:', geoData.status, geoData.error_message ?? '');
      return respond({ results: [], error: `Could not locate "${query}" on the map` }, 200, corsHeaders);
    }

    const { lat, lng } = geoData.results[0].geometry.location;
    console.log('[pudo-locker-search] Geocoded to:', lat, lng);

    // ── Step 2: Find nearest Pudo lockers via Shiplogic ─────────────────
    const shiplogicUrl = `https://api.shiplogic.com/pickup-points?type=locker&lat=${lat}&lng=${lng}&order_closest=true`;
    console.log('[pudo-locker-search] Shiplogic URL:', shiplogicUrl);

    const slRes = await fetch(shiplogicUrl, {
      headers: {
        'Authorization': `Bearer ${pudoKey}`,
        'Content-Type':  'application/json',
      },
    });

    const rawText = await slRes.text();
    console.log('[pudo-locker-search] Shiplogic status:', slRes.status);
    console.log('[pudo-locker-search] Shiplogic raw:', rawText.slice(0, 800));

    if (!slRes.ok) {
      return respond({ results: [], error: `Shiplogic API ${slRes.status}`, raw: rawText.slice(0, 200) }, 200, corsHeaders);
    }

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      return respond({ results: [], error: 'Invalid JSON from Shiplogic' }, 200, corsHeaders);
    }

    console.log('[pudo-locker-search] data keys:', Object.keys(data));

    const pickupPoints: any[] =
      Array.isArray(data)           ? data :
      Array.isArray(data.results)   ? data.results :
      Array.isArray(data.data)      ? data.data :
      Array.isArray(data.locations) ? data.locations : [];

    console.log('[pudo-locker-search] lockers found:', pickupPoints.length);
    if (pickupPoints.length > 0) {
      console.log('[pudo-locker-search] first locker:', JSON.stringify(pickupPoints[0]).slice(0, 400));
    }

    const results = pickupPoints.map((p: any) => ({
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
