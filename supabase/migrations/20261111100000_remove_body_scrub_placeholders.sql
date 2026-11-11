-- Removes the four hidden single-scent placeholder rows created while the body range was
-- being shaped. The range is now one Body Exfoliating Scrub product with four scent variants.
-- No orders, recipes, stock movements or notifications reference these rows.
delete from products where id in ('body-scrub-jasmine', 'body-scrub-spiced-orange', 'body-scrub-watermelon', 'body-scrub-lemon-grass') and active = false;
