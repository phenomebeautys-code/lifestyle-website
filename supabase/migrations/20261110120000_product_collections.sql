-- Self-care products are shown in two collections on the shop:
--   intimate: formulated for intimate areas, can be used all over the body
--   body:     formulated for all over the body, not recommended for intimate areas
-- Additive only: a new nullable column, a check constraint, and the new scent
-- variants for Restore. Body scrub rows stay inactive until priced.

alter table products add column if not exists collection text;

alter table products drop constraint if exists products_collection_check;
alter table products add constraint products_collection_check
  check (collection in ('intimate', 'body'));

update products set collection = 'intimate'
where id in ('refine-exfoliating-scrub', 'restore-moisturising-cream', 'refine-restore-ritual-kit');

update products set collection = 'body', name = 'Refine Body Scrub: ' || split_part(name, ': ', 2)
where id like 'body-scrub-%' and collection is distinct from 'body';

update products
set variants = variants || jsonb_build_array(
  jsonb_build_object('name', 'Scent: Jasmine', 'in_stock', false),
  jsonb_build_object('name', 'Scent: Spiced Orange', 'in_stock', false),
  jsonb_build_object('name', 'Scent: Watermelon', 'in_stock', false),
  jsonb_build_object('name', 'Scent: Lemon Grass', 'in_stock', false)
)
where id = 'restore-moisturising-cream'
  and not (variants @> '[{"name":"Scent: Jasmine"}]'::jsonb);
