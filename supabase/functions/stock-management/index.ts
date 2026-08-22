import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_PASSWORD = Deno.env.get("SHOP_ADMIN_PASSWORD") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = [
  "https://phenomebeauty.co.za",
  "https://www.phenomebeauty.co.za",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(data: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function authorised(password: unknown) {
  if (typeof password !== "string" || !ADMIN_PASSWORD || password.length !== ADMIN_PASSWORD.length) return false;
  let mismatch = 0;
  for (let i = 0; i < ADMIN_PASSWORD.length; i++) mismatch |= password.charCodeAt(i) ^ ADMIN_PASSWORD.charCodeAt(i);
  return mismatch === 0;
}

function parseNonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toStockStatus(stock: number, reorderLevel: number, configuredStatus: unknown) {
  if (configuredStatus === "discontinued") return "discontinued";
  if (stock <= 0) return "out_of_stock";
  if (reorderLevel > 0 && stock <= reorderLevel) return "low_stock";
  return "in_stock";
}

const productSelect = "id, name, price, cost_price, sku, active, availability, stock_on_hand, reorder_level, reorder_quantity, stock_status";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }

  if (!authorised(body.password)) return json({ error: "Unauthorized" }, 401, cors);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  const action = body.action;

  if (action === "get_summary") {
    const { data, error } = await supabase.from("products").select(productSelect).order("idx", { ascending: true });
    if (error) return json({ error: error.message }, 500, cors);

    const products = (data ?? []).map((product) => {
      const stock = Number(product.stock_on_hand);
      const reorderLevel = Number(product.reorder_level);
      const reorderQuantity = Number(product.reorder_quantity);
      const status = toStockStatus(stock, reorderLevel, product.stock_status);
      const suggestedQuantity = reorderQuantity > 0 ? reorderQuantity : Math.max(reorderLevel * 2 - stock, 1);
      return {
        ...product,
        computed_status: status,
        suggested_reorder_quantity: status === "in_stock" || status === "discontinued" ? 0 : suggestedQuantity,
        estimated_reorder_cost: status === "in_stock" || status === "discontinued" ? 0 : suggestedQuantity * (Number(product.cost_price) || 0),
      };
    });

    return json({ products, generated_at: new Date().toISOString() }, 200, cors);
  }

  if (action === "update_settings") {
    const productId = typeof body.product_id === "string" ? body.product_id : "";
    if (!productId) return json({ error: "Missing product_id" }, 400, cors);

    const update: Record<string, number> = {};
    if (body.reorder_level !== undefined) {
      const value = parseNonNegative(body.reorder_level);
      if (value === null) return json({ error: "reorder_level must be a non-negative number" }, 400, cors);
      update.reorder_level = value;
    }
    if (body.reorder_quantity !== undefined) {
      const value = parseNonNegative(body.reorder_quantity);
      if (value === null) return json({ error: "reorder_quantity must be a non-negative number" }, 400, cors);
      update.reorder_quantity = value;
    }
    if (!Object.keys(update).length) return json({ error: "No stock settings supplied" }, 400, cors);

    const { data, error } = await supabase.from("products").update(update).eq("id", productId).select(productSelect).single();
    if (error || !data) return json({ error: error?.message ?? "Product not found" }, error ? 500 : 404, cors);
    return json({ product: data }, 200, cors);
  }

  if (["receive_stock", "adjust_stock"].includes(String(action))) {
    const productId = typeof body.product_id === "string" ? body.product_id : "";
    const quantity = parsePositive(body.quantity);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!productId) return json({ error: "Missing product_id" }, 400, cors);
    if (quantity === null) return json({ error: "quantity must be greater than zero" }, 400, cors);
    if (!note) return json({ error: "A note is required" }, 400, cors);

    let delta = quantity;
    let movementType = "purchase";
    if (action === "adjust_stock") {
      if (body.direction !== "increase" && body.direction !== "decrease") {
        return json({ error: "direction must be increase or decrease" }, 400, cors);
      }
      delta = body.direction === "decrease" ? -quantity : quantity;
      movementType = "adjustment";
    }

    const { data: product, error: productError } = await supabase.from("products").select("id, stock_on_hand").eq("id", productId).single();
    if (productError || !product) return json({ error: "Product not found" }, 404, cors);

    const before = Number(product.stock_on_hand);
    const after = before + delta;
    if (!Number.isFinite(before) || after < 0) return json({ error: "Stock cannot become negative" }, 400, cors);

    const { error: movementError } = await supabase.from("inventory_movements").insert({
      product_id: productId,
      movement_type: movementType,
      quantity: delta,
      stock_before: before,
      stock_after: after,
      reference_type: "manual_admin",
      note,
    });
    if (movementError) return json({ error: movementError.message }, 500, cors);

    const { data: updated, error: updateError } = await supabase.from("products").update({ stock_on_hand: after }).eq("id", productId).select(productSelect).single();
    if (updateError || !updated) return json({ error: updateError?.message ?? "Stock update failed" }, 500, cors);
    return json({ product: updated }, 200, cors);
  }

  if (action === "get_history") {
    const productId = typeof body.product_id === "string" ? body.product_id : "";
    if (!productId) return json({ error: "Missing product_id" }, 400, cors);
    const { data, error } = await supabase.from("inventory_movements").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(100);
    if (error) return json({ error: error.message }, 500, cors);
    return json({ movements: data ?? [] }, 200, cors);
  }

  return json({ error: "Unknown action" }, 400, cors);
});
