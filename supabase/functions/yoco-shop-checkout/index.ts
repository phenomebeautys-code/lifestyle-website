import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://www.phenomebeauty.co.za", "https://phenomebeauty.co.za"];

Deno.serve(async (req: Request) => {
  // ── CORS ─────────────────────────────────────────────────────────────────
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { order_id, success_url, cancel_url } = body;

    if (!order_id || !success_url || !cancel_url) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Service role client ───────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Fetch the order ───────────────────────────────────────────────────
    const { data: order, error: orderErr } = await supabase
      .from("shop_orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Prevent double-paying ─────────────────────────────────────────────
    if (order.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "Order already paid." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SERVER-SIDE PRICE VALIDATION ──────────────────────────────────────
    const productIds: string[] = (order.items ?? []).map((i: { productId: string }) => i.productId);

    const { data: products, error: prodErr } = await supabase
      .from("shop_products")
      .select("id, price")
      .in("id", productIds);

    if (prodErr || !products) {
      return new Response(JSON.stringify({ error: "Could not validate product prices." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceMap: Record<string, number> = {};
    products.forEach((p: { id: string; price: number }) => {
      priceMap[p.id] = Number(p.price);
    });

    let serverSubtotal = 0;
    for (const item of order.items ?? []) {
      const trustedPrice = priceMap[item.productId];
      if (trustedPrice === undefined) {
        return new Response(JSON.stringify({ error: `Unknown product: ${item.productId}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      serverSubtotal += trustedPrice * Number(item.qty);
    }

    // ── Use the delivery fee already stored on the order ──────────────────
    // The fee was set correctly at order creation time:
    //   locker orders  → R70
    //   door delivery  → R99  (or legacy R80)
    // Never override with a hardcoded constant here.
    const deliveryFee   = Number(order.delivery_fee);
    const serverTotal   = serverSubtotal + deliveryFee;

    // ── Correct any tampered subtotal/total (fee stays as-is) ────────────
    const { error: updateErr } = await supabase
      .from("shop_orders")
      .update({
        subtotal:     serverSubtotal,
        total_amount: serverTotal,
      })
      .eq("id", order_id);

    if (updateErr) {
      console.error("Failed to correct order total:", updateErr);
    }

    // ── Create Yoco payment session ───────────────────────────────────────
    const yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${Deno.env.get("YOCO_SECRET_KEY")}`,
      },
      body: JSON.stringify({
        amount:    Math.round(serverTotal * 100), // Yoco expects cents, integer
        currency:  "ZAR",
        cancelUrl: cancel_url,
        successUrl: success_url,
        metadata:  { order_id, customer_email: order.customer_email },
      }),
    });

    if (!yocoRes.ok) {
      const yocoErr = await yocoRes.text();
      console.error("Yoco error:", yocoErr);
      return new Response(JSON.stringify({ error: "Payment provider error. Please try again." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const yocoData    = await yocoRes.json();
    const redirectUrl = yocoData.redirectUrl ?? yocoData.url;

    if (!redirectUrl) {
      return new Response(JSON.stringify({ error: "No payment URL returned." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ redirectUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
