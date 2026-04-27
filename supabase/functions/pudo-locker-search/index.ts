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
    // PUDO_API_KEY is the Shiplogic/TCG API key from your Pudo merchant account
    const apiKey = Deno.env.get('PUDO_API_KEY')!;

    // Official endpoint per TCG Locker API docs (August 2025)
    // https://thecourierguy.co.za/wp-content/uploads/2025/08/The-Courier-Guy-Locker-API-docs.pdf
    const res = await fetch(
      `https://api.shiplogic.com/pickup-points?type=locker&search=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error('Shiplogic pickup-points error:', res.status, body);
      return new Response(JSON.stringify({ results: [], error: `API ${res.status}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await res.json();

    // Shiplogic returns { results: [...] } — each item has: id, name, address object
    const pickupPoints: any[] = Array.isArray(data.results) ? data.results : [];

    const results = pickupPoints.map((p: any) => ({
      // id is used as the delivery_pickup_point_id when creating shipments
      id:      p.id ?? p.pickup_point_id ?? '',
      name:    p.name ?? '',
      address: [
        p.address?.street_address ?? '',
        p.address?.local_area     ?? '',
        p.address?.city           ?? '',
        p.address?.code           ?? '',
      ].filter(Boolean).join(', '),
    }));

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders },
    });

  } catch (err) {
    console.error('Unexpected error in pudo-locker-search:', err);
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
