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

  const url = new URL(req.url);
  const query = url.searchParams.get('q') || '';

  if (!query.trim()) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const pudoKey = Deno.env.get('PUDO_API_KEY')!;

    const res = await fetch(
      `https://api.shiplogic.com/pickup-points?type=locker&search=${encodeURIComponent(query)}&limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${pudoKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error('Pudo API error:', res.status, body);
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await res.json();
    const pickupPoints = data.results || data.pickup_points || data || [];

    const results = (Array.isArray(pickupPoints) ? pickupPoints : []).map((p: any) => ({
      id:      p.id || p.code || p.terminal_id || '',
      name:    p.name || p.description || '',
      address: [
        p.address?.street_address || p.street_address || '',
        p.address?.local_area     || p.local_area     || '',
        p.address?.city           || p.city           || '',
        p.address?.code           || p.postal_code    || '',
      ].filter(Boolean).join(', '),
    }));

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
