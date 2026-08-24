// shop-admin-materials.js - Updated for variant-aware BOM system
// This is a placeholder - the actual file needs the full implementation
// Key changes needed:
// 1. Add variant selector UI in recipe modal
// 2. Pass product_variant to get_recipe and save_recipe actions
// 3. Display variant-specific ingredient lists

// Example of how to call the updated API:
async function loadRecipe(productId, productVariant = null) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/materials-management`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      password: ADMIN_PASSWORD,
      action: 'get_recipe',
      product_id: productId,
      product_variant: productVariant  // NEW: Pass variant
    })
  });
  const result = await response.json();
  return result;
}

async function saveRecipe(productId, productVariant, lines, syncCostPrice = true) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/materials-management`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      password: ADMIN_PASSWORD,
      action: 'save_recipe',
      product_id: productId,
      product_variant: productVariant,  // NEW: Pass variant
      lines: lines,
      sync_cost_price: syncCostPrice
    })
  });
  const result = await response.json();
  return result;
}

// Variant options for products
const VARIANT_OPTIONS = {
  'refine-exfoliating-scrub': [
    { value: 'calm', label: 'Calm (Chamomile)' },
    { value: 'balance', label: 'Balance (Lavender)' },
    { value: 'bloom', label: 'Bloom (Rose Geranium)' },
    { value: 'pure', label: 'Pure (Unscented)' }
  ],
  'restore-moisturising-cream': [
    { value: 'calm', label: 'Calm (Chamomile)' },
    { value: 'balance', label: 'Balance (Lavender)' },
    { value: 'bloom', label: 'Bloom (Rose Geranium)' },
    { value: 'pure', label: 'Pure (Unscented)' }
  ],
  'refine-restore-ritual-kit': [
    { value: 'calm', label: 'Calm' },
    { value: 'balance', label: 'Balance' },
    { value: 'bloom', label: 'Bloom' },
    { value: 'pure', label: 'Pure' }
  ],
  'film-wax-collection': [
    { value: 'onyx', label: 'Onyx' },
    { value: 'blush', label: 'Blush' },
    { value: 'luxe', label: 'Luxe' },
    { value: 'nude', label: 'Nude' }
  ],
  'pro-max-100-wax-heater': [
    { value: 'black', label: 'Black' },
    { value: 'white', label: 'White' },
    { value: 'pink', label: 'Pink' }
  ]
};
