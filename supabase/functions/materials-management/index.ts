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

const VALID_UNITS = ["g", "ml", "drops", "unit", "cm"];
const VALID_CATEGORIES = ["ingredient", "packaging", "kit_component"];
const VALID_MOVEMENT_TYPES = [
  "initial_stock", "purchase", "consumption", "conversion_in",
  "conversion_out", "adjustment", "damaged", "returned", "correction",
];

const materialSelect = "id, name, category, unit, sellable_standalone, bulk_quantity, bulk_cost, cost_per_unit, stock_on_hand, reorder_level, reorder_quantity, active, created_at, updated_at";

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

  if (action === "get_materials") {
    const { data, error } = await supabase
      .from("raw_materials")
      .select(materialSelect)
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) return json({ error: error.message }, 500, cors);

    const { data: lastMovements } = await supabase
      .from("material_movements")
      .select("material_id, created_at")
      .order("created_at", { ascending: false });

    const lastMovementMap = new Map<string, string>();
    for (const m of lastMovements ?? []) {
      if (!lastMovementMap.has(m.material_id)) lastMovementMap.set(m.material_id, m.created_at);
    }

    const materials = (data ?? []).map((m) => ({
      ...m,
      last_movement_at: lastMovementMap.get(m.id) ?? null,
      computed_status:
        m.active === false ? "discontinued" :
        Number(m.stock_on_hand) <= 0 ? "out_of_stock" :
        m.reorder_level > 0 && Number(m.stock_on_hand) <= Number(m.reorder_level) ? "low_stock" :
        "in_stock",
    }));

    return json({ materials, generated_at: new Date().toISOString() }, 200, cors);
  }

  if (action === "upsert_material") {
    const material = body.material as Record<string, unknown> | undefined;
    if (!material || typeof material !== "object") return json({ error: "Missing material" }, 400, cors);

    const name = typeof material.name === "string" ? material.name.trim() : "";
    if (!name) return json({ error: "Material name is required" }, 400, cors);

    const category = typeof material.category === "string" ? material.category : "ingredient";
    if (!VALID_CATEGORIES.includes(category)) return json({ error: "Invalid category" }, 400, cors);

    const unit = typeof material.unit === "string" ? material.unit : "";
    if (!VALID_UNITS.includes(unit)) return json({ error: "Invalid unit" }, 400, cors);

    const bulkQuantity = parsePositive(material.bulk_quantity);
    if (bulkQuantity === null) return json({ error: "bulk_quantity must be greater than zero" }, 400, cors);

    const bulkCost = parseNonNegative(material.bulk_cost);
    if (bulkCost === null) return json({ error: "bulk_cost must be zero or greater" }, 400, cors);

    const reorderLevel = parseNonNegative(material.reorder_level ?? 0) ?? 0;
    const reorderQuantity = parseNonNegative(material.reorder_quantity ?? 0) ?? 0;
    const sellableStandalone = Boolean(material.sellable_standalone);
    const active = material.active === undefined ? true : Boolean(material.active);

    const payload = {
      name, category, unit,
      sellable_standalone: sellableStandalone,
      bulk_quantity: bulkQuantity,
      bulk_cost: bulkCost,
      reorder_level: reorderLevel,
      reorder_quantity: reorderQuantity,
      active,
      updated_at: new Date().toISOString(),
    };

    if (material.id) {
      const { data, error } = await supabase
        .from("raw_materials")
        .update(payload)
        .eq("id", material.id)
        .select(materialSelect)
        .single();
      if (error || !data) return json({ error: error?.message ?? "Material not found" }, error ? 500 : 404, cors);
      return json({ material: data }, 200, cors);
    }

    const { data, error } = await supabase
      .from("raw_materials")
      .insert({ ...payload, stock_on_hand: 0 })
      .select(materialSelect)
      .single();
    if (error || !data) return json({ error: error?.message ?? "Failed to create material" }, 500, cors);
    return json({ material: data }, 200, cors);
  }

  if (action === "delete_material") {
    const materialId = typeof body.material_id === "string" ? body.material_id : "";
    if (!materialId) return json({ error: "Missing material_id" }, 400, cors);

    const { count: recipeCount } = await supabase
      .from("product_recipes")
      .select("id", { count: "exact", head: true })
      .eq("material_id", materialId);

    if (recipeCount && recipeCount > 0) {
      return json({ error: "Material is used in one or more recipes. Remove it from recipes first, or mark it inactive instead." }, 409, cors);
    }

    const { error } = await supabase.from("raw_materials").delete().eq("id", materialId);
    if (error) return json({ error: error.message }, 500, cors);
    return json({ success: true }, 200, cors);
  }

  if (["initial_stock", "receive_stock", "adjust_stock"].includes(String(action))) {
    const materialId = typeof body.material_id === "string" ? body.material_id : "";
    const quantity = parsePositive(body.quantity);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!materialId) return json({ error: "Missing material_id" }, 400, cors);
    if (quantity === null) return json({ error: "quantity must be greater than zero" }, 400, cors);
    if (!note) return json({ error: "A note is required" }, 400, cors);

    let delta = quantity;
    let movementType = "purchase";
    if (action === "initial_stock") movementType = "initial_stock";
    if (action === "adjust_stock") {
      if (body.direction !== "increase" && body.direction !== "decrease") return json({ error: "direction must be increase or decrease" }, 400, cors);
      delta = body.direction === "decrease" ? -quantity : quantity;
      movementType = "adjustment";
    }

    const { data: material, error: materialError } = await supabase
      .from("raw_materials").select("id, stock_on_hand").eq("id", materialId).single();
    if (materialError || !material) return json({ error: "Material not found" }, 404, cors);

    const before = Number(material.stock_on_hand);
    if (action === "initial_stock" && before !== 0) return json({ error: "Initial stock can only be set when current stock is zero" }, 409, cors);

    const after = before + delta;
    if (!Number.isFinite(before) || after < 0) return json({ error: "Stock cannot become negative" }, 400, cors);

    const { error: movementError } = await supabase.from("material_movements").insert({
      material_id: materialId, movement_type: movementType, quantity: delta,
      stock_before: before, stock_after: after, reference_type: "manual_admin", note,
    });
    if (movementError) return json({ error: movementError.message }, 500, cors);

    const { data: updated, error: updateError } = await supabase
      .from("raw_materials").update({ stock_on_hand: after, updated_at: new Date().toISOString() })
      .eq("id", materialId).select(materialSelect).single();
    if (updateError || !updated) return json({ error: updateError?.message ?? "Stock update failed" }, 500, cors);
    return json({ material: updated }, 200, cors);
  }

  if (action === "get_material_history") {
    const materialId = typeof body.material_id === "string" ? body.material_id : "";
    if (!materialId) return json({ error: "Missing material_id" }, 400, cors);
    const { data, error } = await supabase
      .from("material_movements").select("*").eq("material_id", materialId)
      .order("created_at", { ascending: false }).limit(100);
    if (error) return json({ error: error.message }, 500, cors);
    return json({ movements: data ?? [] }, 200, cors);
  }

  if (action === "get_conversions") {
    const { data, error } = await supabase
      .from("raw_material_conversions")
      .select("*, source:source_material_id(id, name, unit), output:output_material_id(id, name, unit)")
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500, cors);
    return json({ conversions: data ?? [] }, 200, cors);
  }

  if (action === "save_conversion") {
    const conversion = body.conversion as Record<string, unknown> | undefined;
    if (!conversion) return json({ error: "Missing conversion" }, 400, cors);

    const sourceMaterialId = typeof conversion.source_material_id === "string" ? conversion.source_material_id : "";
    const outputMaterialId = typeof conversion.output_material_id === "string" ? conversion.output_material_id : "";
    const sourceQuantity = parsePositive(conversion.source_quantity);
    const outputQuantity = parsePositive(conversion.output_quantity);
    const yieldLossPercent = parseNonNegative(conversion.yield_loss_percent ?? 0) ?? 0;
    const note = typeof conversion.note === "string" ? conversion.note.trim() : null;

    if (!sourceMaterialId || !outputMaterialId) return json({ error: "Both source and output materials are required" }, 400, cors);
    if (sourceMaterialId === outputMaterialId) return json({ error: "Source and output materials must be different" }, 400, cors);
    if (sourceQuantity === null || outputQuantity === null) return json({ error: "source_quantity and output_quantity must be greater than zero" }, 400, cors);

    const payload = {
      source_material_id: sourceMaterialId, output_material_id: outputMaterialId,
      source_quantity: sourceQuantity, output_quantity: outputQuantity,
      yield_loss_percent: yieldLossPercent, note,
    };

    if (conversion.id) {
      const { data, error } = await supabase.from("raw_material_conversions").update(payload).eq("id", conversion.id).select("*").single();
      if (error || !data) return json({ error: error?.message ?? "Conversion not found" }, error ? 500 : 404, cors);
      return json({ conversion: data }, 200, cors);
    }

    const { data, error } = await supabase.from("raw_material_conversions").insert(payload).select("*").single();
    if (error || !data) return json({ error: error?.message ?? "Failed to create conversion" }, 500, cors);
    return json({ conversion: data }, 200, cors);
  }

  if (action === "delete_conversion") {
    const conversionId = typeof body.conversion_id === "string" ? body.conversion_id : "";
    if (!conversionId) return json({ error: "Missing conversion_id" }, 400, cors);
    const { error } = await supabase.from("raw_material_conversions").delete().eq("id", conversionId);
    if (error) return json({ error: error.message }, 500, cors);
    return json({ success: true }, 200, cors);
  }

  if (action === "run_conversion") {
    const conversionId = typeof body.conversion_id === "string" ? body.conversion_id : "";
    const batches = parsePositive(body.batches ?? 1) ?? 1;
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!conversionId) return json({ error: "Missing conversion_id" }, 400, cors);
    if (!note) return json({ error: "A note is required" }, 400, cors);

    const { data: conv, error: convError } = await supabase
      .from("raw_material_conversions").select("*").eq("id", conversionId).single();
    if (convError || !conv) return json({ error: "Conversion rule not found" }, 404, cors);

    const sourceConsumed = Number(conv.source_quantity) * batches;
    const outputProduced = Number(conv.output_quantity) * batches;

    const { data: sourceMat, error: sourceErr } = await supabase
      .from("raw_materials").select("id, stock_on_hand").eq("id", conv.source_material_id).single();
    if (sourceErr || !sourceMat) return json({ error: "Source material not found" }, 404, cors);

    const sourceBefore = Number(sourceMat.stock_on_hand);
    const sourceAfter = sourceBefore - sourceConsumed;
    if (sourceAfter < 0) return json({ error: "Not enough source material stock for this conversion" }, 400, cors);

    const { data: outputMat, error: outputErr } = await supabase
      .from("raw_materials").select("id, stock_on_hand").eq("id", conv.output_material_id).single();
    if (outputErr || !outputMat) return json({ error: "Output material not found" }, 404, cors);

    const outputBefore = Number(outputMat.stock_on_hand);
    const outputAfter = outputBefore + outputProduced;

    const { error: outMoveErr } = await supabase.from("material_movements").insert({
      material_id: conv.source_material_id, movement_type: "conversion_out", quantity: -sourceConsumed,
      stock_before: sourceBefore, stock_after: sourceAfter, reference_type: "conversion", reference_id: conversionId, note,
    });
    if (outMoveErr) return json({ error: outMoveErr.message }, 500, cors);

    const { error: inMoveErr } = await supabase.from("material_movements").insert({
      material_id: conv.output_material_id, movement_type: "conversion_in", quantity: outputProduced,
      stock_before: outputBefore, stock_after: outputAfter, reference_type: "conversion", reference_id: conversionId, note,
    });
    if (inMoveErr) return json({ error: inMoveErr.message }, 500, cors);

    await supabase.from("raw_materials").update({ stock_on_hand: sourceAfter, updated_at: new Date().toISOString() }).eq("id", conv.source_material_id);
    await supabase.from("raw_materials").update({ stock_on_hand: outputAfter, updated_at: new Date().toISOString() }).eq("id", conv.output_material_id);

    return json({ success: true, source_stock_after: sourceAfter, output_stock_after: outputAfter }, 200, cors);
  }

  if (action === "get_recipe") {
    const productId = typeof body.product_id === "string" ? body.product_id : "";
    const productVariant = typeof body.product_variant === "string" ? body.product_variant : null;
    if (!productId) return json({ error: "Missing product_id" }, 400, cors);

    let query = supabase
      .from("product_recipes")
      .select("id, product_id, product_variant, material_id, quantity_required, material:material_id(id, name, unit, cost_per_unit, category)")
      .eq("product_id", productId);

    if (productVariant) {
      query = query.eq("product_variant", productVariant);
    } else {
      // If no variant specified, get recipes where product_variant is NULL (base recipes)
      query = query.is("product_variant", null);
    }

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500, cors);

    const computedCost = (data ?? []).reduce((sum, line: any) => {
      const costPerUnit = Number(line.material?.cost_per_unit ?? 0);
      return sum + Number(line.quantity_required) * costPerUnit;
    }, 0);

    return json({ recipe: data ?? [], computed_cost: computedCost }, 200, cors);
  }

  if (action === "save_recipe") {
    const productId = typeof body.product_id === "string" ? body.product_id : "";
    const productVariant = typeof body.product_variant === "string" ? body.product_variant : null;
    const lines = Array.isArray(body.lines) ? body.lines : null;
    const syncCostPrice = body.sync_cost_price !== false;
    if (!productId) return json({ error: "Missing product_id" }, 400, cors);
    if (!lines) return json({ error: "lines must be an array" }, 400, cors);

    const cleanLines: { material_id: string; quantity_required: number; product_variant: string | null }[] = [];
    for (const line of lines) {
      const materialId = typeof line?.material_id === "string" ? line.material_id : "";
      const quantity = parsePositive(line?.quantity_required);
      if (!materialId || quantity === null) {
        return json({ error: "Each recipe line needs a material_id and a positive quantity_required" }, 400, cors);
      }
      cleanLines.push({ material_id: materialId, quantity_required: quantity, product_variant: productVariant });
    }

    // Delete existing recipes for this product + variant combination
    let deleteQuery = supabase.from("product_recipes").delete().eq("product_id", productId);
    if (productVariant) {
      deleteQuery = deleteQuery.eq("product_variant", productVariant);
    } else {
      deleteQuery = deleteQuery.is("product_variant", null);
    }
    const { error: deleteError } = await deleteQuery;
    if (deleteError) return json({ error: deleteError.message }, 500, cors);

    if (cleanLines.length) {
      const { error: insertError } = await supabase.from("product_recipes").insert(
        cleanLines.map((line) => ({ product_id: productId, product_variant: line.product_variant, material_id: line.material_id, quantity_required: line.quantity_required }))
      );
      if (insertError) return json({ error: insertError.message }, 500, cors);
    }

    const { data: costRows } = await supabase
      .from("product_recipes")
      .select("quantity_required, material:material_id(cost_per_unit)")
      .eq("product_id", productId);

    const computedCost = (costRows ?? []).reduce((sum, row: any) => {
      return sum + Number(row.quantity_required) * Number(row.material?.cost_per_unit ?? 0);
    }, 0);

    if (syncCostPrice) {
      await supabase.from("products").update({ cost_price: computedCost }).eq("id", productId);
    }

    return json({ success: true, computed_cost: computedCost }, 200, cors);
  }

  if (action === "get_product_costs") {
    const { data, error } = await supabase.from("product_computed_cost").select("*");
    if (error) return json({ error: error.message }, 500, cors);
    return json({ costs: data ?? [] }, 200, cors);
  }

  return json({ error: "Unknown action" }, 400, cors);
});
