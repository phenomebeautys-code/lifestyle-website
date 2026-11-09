-- Restore Body Moisturising Cream: one photo per body scent.
-- Images are served from the site's own assets folder, so previews and production both show them.

update products
set
  image_url = '/assets/products/restore-body-jasmine.webp',
  image_urls = array[
    '/assets/products/restore-body-jasmine.webp',
    '/assets/products/restore-body-spiced-orange.webp',
    '/assets/products/restore-body-watermelon.webp',
    '/assets/products/restore-body-lemon-grass.webp'
  ],
  variants = '[
    {"name":"Scent: Jasmine","in_stock":false,"image":"/assets/products/restore-body-jasmine.webp"},
    {"name":"Scent: Spiced Orange","in_stock":false,"image":"/assets/products/restore-body-spiced-orange.webp"},
    {"name":"Scent: Watermelon","in_stock":false,"image":"/assets/products/restore-body-watermelon.webp"},
    {"name":"Scent: Lemon Grass","in_stock":false,"image":"/assets/products/restore-body-lemon-grass.webp"}
  ]'::jsonb
where id = 'body-restore-moisturising-cream';
