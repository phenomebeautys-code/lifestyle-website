-- Add availability status to products
-- Values: 'available' (default) | 'coming_soon' | 'unavailable'
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'available'
  CHECK (availability IN ('available', 'coming_soon', 'unavailable'));
