-- Add product_variant column to product_recipes for variant-aware BOM
-- Migration: add_product_variant_to_recipes
-- Date: 2026-08-24

-- Add product_variant column to product_recipes
ALTER TABLE product_recipes 
ADD COLUMN IF NOT EXISTS product_variant TEXT DEFAULT NULL;

-- Add index for faster variant-based lookups
CREATE INDEX IF NOT EXISTS idx_product_recipes_product_variant 
ON product_recipes(product_id, product_variant);

-- Drop old unique constraint and add new one that includes product_variant
ALTER TABLE product_recipes DROP CONSTRAINT IF EXISTS product_recipes_product_id_material_id_key;
ALTER TABLE product_recipes ADD CONSTRAINT product_recipes_product_id_variant_material_id_key UNIQUE (product_id, product_variant, material_id);

-- Add comment for documentation
COMMENT ON COLUMN product_recipes.product_variant IS 'Variant identifier for variant-specific recipes (e.g., ''calm'', ''balance'', ''bloom'', ''pure'' for Refine/Restore, ''onyx'', ''blush'', ''luxe'', ''nude'' for Film Wax, ''black'', ''white'', ''pink'' for Pro-Max Heater). NULL means recipe applies to all variants or product has no variants.';
