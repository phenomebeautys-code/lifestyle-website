-- Body collection presented like the intimate range: one Refine and one Restore
-- product, each with the four body scents as variants.
-- The four single-scent placeholder rows are deactivated, not deleted.
-- The four body scents come off the intimate Restore again.

-- 1. Intimate Restore back to its original four scents.
update products
set variants = coalesce((
  select jsonb_agg(v order by ord)
  from jsonb_array_elements(variants) with ordinality as t(v, ord)
  where v->>'name' not in ('Scent: Jasmine', 'Scent: Spiced Orange', 'Scent: Watermelon', 'Scent: Lemon Grass')
), '[]'::jsonb)
where id = 'restore-moisturising-cream';

-- 2. Body Refine and Body Restore, coming soon, priced later.
insert into products (id, name, brand, price, cost_price, sku, category, market, description, image_url, image_urls, variants, sizes, active, availability, stock_status, stock_on_hand, reorder_level, reorder_quantity, weight_kg, length_cm, width_cm, height_cm, pack_flat, sort_order, includes, available_in, hero_segment, collection)
values
(
  'body-refine-exfoliating-scrub', 'Refine Body Exfoliating Scrub', 'PhenomeBeauty', 0, 0, '', 'Body Scrubs', 'self_care', null,
  '/assets/products/refine-scrub-jasmine.webp',
  array['/assets/products/refine-scrub-jasmine.webp', '/assets/products/refine-scrub-spiced-orange.webp', '/assets/products/refine-scrub-watermelon.webp', '/assets/products/refine-scrub-lemon-grass.webp'],
  '[
    {"name":"Scent: Jasmine","in_stock":false,"image":"/assets/products/refine-scrub-jasmine.webp"},
    {"name":"Scent: Spiced Orange","in_stock":false,"image":"/assets/products/refine-scrub-spiced-orange.webp"},
    {"name":"Scent: Watermelon","in_stock":false,"image":"/assets/products/refine-scrub-watermelon.webp"},
    {"name":"Scent: Lemon Grass","in_stock":false,"image":"/assets/products/refine-scrub-lemon-grass.webp"}
  ]'::jsonb,
  '[{"name":"250ml","price":0}]'::jsonb,
  true, 'coming_soon', 'out_of_stock', 0, 0, 0, 0.265, 10.8, 10.8, 12.6, false, 100, '{}'::text[], '{}'::text[], null, 'body'
),
(
  'body-restore-moisturising-cream', 'Restore Body Moisturising Cream', 'PhenomeBeauty', 0, 0, '', 'Body Moisturisers', 'self_care', null,
  null, '{}'::text[],
  '[
    {"name":"Scent: Jasmine","in_stock":false},
    {"name":"Scent: Spiced Orange","in_stock":false},
    {"name":"Scent: Watermelon","in_stock":false},
    {"name":"Scent: Lemon Grass","in_stock":false}
  ]'::jsonb,
  '[{"name":"250ml","price":0}]'::jsonb,
  true, 'coming_soon', 'out_of_stock', 0, 0, 0, 0.265, 10.8, 10.8, 12.6, false, 101, '{}'::text[], '{}'::text[], null, 'body'
)
on conflict (id) do nothing;

-- 3. Single-scent placeholder rows are hidden until the range is set up.
update products set active = false where id like 'body-scrub-%' and collection = 'body';
