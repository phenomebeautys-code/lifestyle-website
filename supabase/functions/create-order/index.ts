import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://www.phenomebeauty.co.za", "https://phenomebeauty.co.za"];

Deno.serve(async (req: Request) => {
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
    const {
      customer,
      delivery_method,
      delivery_address,
      delivery_fee,
      locker_id,
      locker_name,
      locker_address,
      special_instructions,
      cart,
    } = body;

    if (!customer?.name || !customer?.email || !customer?.phone) {
      return new Response(JSON.stringify({ error: "Missing customer details." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!cart || !cart.length) {
      return new Response(JSON.stringify({ error: "Cart is empty." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!delivery_method) {
      return new Response(JSON.stringify({ error: "Missing delivery method." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build delivery_address text column
    let deliveryAddressText = "";
    if (delivery_method === "door" && delivery_address) {
      deliveryAddressText = [
        delivery_address.street,
        delivery_address.suburb,
        delivery_address.city,
        delivery_address.postal,
        delivery_address.province,
      ].filter(Boolean).join(", ");
    } else if (delivery_method === "locker") {
      deliveryAddressText = [locker_name, locker_address].filter(Boolean).join(" -- ");
    }

    if (!deliveryAddressText) {
      return new Response(JSON.stringify({ error: "Missing delivery address." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build delivery_meta JSONB
    const deliveryMeta = delivery_method === "door"
      ? { ...delivery_address, special_instructions: special_instructions || "" }
      : {
          locker_id:        locker_id || "",
          locker_name:      locker_name || "",
          locker_address:   locker_address || "",
          special_instructions: special_instructions || "",
        };

    // Map cart items -- productId is what yoco-shop-checkout expects
    const items = cart.map((i: { id: string; name: string; price: number; qty: number; image: string }) => ({
      productId: i.id,
      name:      i.name,
      price:     Number(i.price),
      qty:       Number(i.qty),
      image:     i.image || "",
    }));

    const subtotal    = items.reduce((s: number, i: { price: number; qty: number }) => s + i.price * i.qty, 0);
    const fee         = Number(delivery_fee) || (delivery_method === "locker" ? 59 : 99);
    const totalAmount = subtotal + fee;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error: insertErr } = await supabase
      .from("shop_orders")
      .insert({
        customer_name:    customer.name,
        customer_email:   customer.email,
        customer_phone:   customer.phone,
        delivery_address: deliveryAddressText,
        delivery_method:  delivery_method,
        delivery_meta:    deliveryMeta,
        delivery_fee:     fee,
        items:            items,
        subtotal:         subtotal,
        total_amount:     totalAmount,
        notes:            special_instructions || null,
        payment_status:   "unpaid",
        status:           "pending",
        is_gift:          false,
        gift_message:     null,
      })
      .select("id, customer_token")
      .single();

    if (insertErr || !order) {
      console.error("[create-order] Insert failed:", insertErr);
      return new Response(JSON.stringify({ error: "Could not create order." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ order_id: order.id, order_ref: order.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[create-order] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
