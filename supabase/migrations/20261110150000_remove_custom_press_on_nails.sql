-- Custom Press-on Nails is no longer offered. No recipes or stock movements reference it.
-- Paid orders keep their own item snapshot, so they are unaffected.
delete from products where id = 'custom-press-on-nails';
