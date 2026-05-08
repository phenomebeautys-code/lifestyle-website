-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add shipping dimensions & weight to products
-- Date: 2026-05-08
-- Purpose: Enables the packaging engine to calculate the correct Pudo box size
--          (XS → XL) based on actual cart contents, replacing the hardcoded
--          60×17×8 cm / 1 kg parcel spec in pudo-create-shipment.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add columns
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_kg     numeric(6,3) NULL,
  ADD COLUMN IF NOT EXISTS length_cm     numeric(6,1) NULL,
  ADD COLUMN IF NOT EXISTS width_cm      numeric(6,1) NULL,
  ADD COLUMN IF NOT EXISTS height_cm     numeric(6,1) NULL,
  ADD COLUMN IF NOT EXISTS pack_flat     boolean      NOT NULL DEFAULT false;

-- Column notes:
--   weight_kg  — actual product weight in kilograms (e.g. 0.265)
--   length_cm  — longest dimension in centimetres
--   width_cm   — second dimension
--   height_cm  — third dimension (shortest when upright)
--   pack_flat  — when TRUE the engine always uses the lying-flat orientation
--                (rotates so the smallest dimension becomes the height)
--                Used for the wax bag: upright 23×9×7.7 cm stays under 8 cm tall

-- 2. Seed known product dimensions
--    All measurements confirmed by PhenomeBeauty (May 2026)

-- Exfoliator (body scrub)
UPDATE products SET
  weight_kg  = 0.265,
  length_cm  = 8.5,
  width_cm   = 8.5,
  height_cm  = 6.0,
  pack_flat  = false
WHERE id = 'smooth-ritual';

-- Cream (moisturiser)
UPDATE products SET
  weight_kg  = 0.260,
  length_cm  = 8.5,
  width_cm   = 8.5,
  height_cm  = 6.0,
  pack_flat  = false
WHERE id = 'smooth-veil';

-- Kit (Exfoliator + Cream + Gloves — loose in packet, stacked)
-- Two jars stacked: same 8.5×8.5 cm footprint, combined height 12 cm
-- Gloves weight is negligible (<2 g), included in total
UPDATE products SET
  weight_kg  = 0.527,
  length_cm  = 8.5,
  width_cm   = 8.5,
  height_cm  = 12.0,
  pack_flat  = false
WHERE id = 'smooth-ritual-kit';

-- Wax bag — must always lie flat
-- Upright: 12.5 × 9 × 23 cm | Lying flat: 23 × 9 × 7.7 cm (confirmed in-store)
-- pack_flat = true tells the engine to use the flat orientation
UPDATE products SET
  weight_kg  = 0.560,
  length_cm  = 23.0,
  width_cm   = 9.0,
  height_cm  = 7.7,
  pack_flat  = true
WHERE id = 'professional-wax';

-- Wax melting pot — comes in its own retail box, placed upright
-- Dimensions: 183 mm × 183 mm × 147 mm → 18.3 × 18.3 × 14.7 cm
-- Weight estimated at 1.2 kg (pot + power cord + retail box)
UPDATE products SET
  weight_kg  = 1.200,
  length_cm  = 18.3,
  width_cm   = 18.3,
  height_cm  = 14.7,
  pack_flat  = false
WHERE id = 'wax-melting-pot';

-- 3. Verification query (run manually to confirm seeding)
-- SELECT id, name, weight_kg, length_cm, width_cm, height_cm, pack_flat
-- FROM products
-- WHERE id IN ('smooth-ritual','smooth-veil','smooth-ritual-kit','professional-wax','wax-melting-pot')
-- ORDER BY id;
