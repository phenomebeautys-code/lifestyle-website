-- Migration: create pudo_rates table and seed standard box sizes

create table if not exists public.pudo_rates (
  id            serial primary key,
  box_size      text         not null unique,
  max_weight_kg numeric(6,3) not null,
  locker_fee    numeric(8,2) not null,
  door_fee      numeric(8,2) not null,
  description   text
);

-- Seed five standard Pudo box sizes
insert into public.pudo_rates (box_size, max_weight_kg, locker_fee, door_fee, description)
values
  ('XS',  1.000,  59.00,  99.00, 'Up to 1 kg -- small items, serums, accessories'),
  ('S',   2.000,  69.00, 109.00, 'Up to 2 kg -- single full-size products'),
  ('M',   5.000,  89.00, 129.00, 'Up to 5 kg -- multi-product orders'),
  ('L',  10.000, 109.00, 149.00, 'Up to 10 kg -- large bundles'),
  ('XL', 20.000, 129.00, 169.00, 'Up to 20 kg -- bulk orders')
on conflict (box_size) do update
  set max_weight_kg = excluded.max_weight_kg,
      locker_fee    = excluded.locker_fee,
      door_fee      = excluded.door_fee,
      description   = excluded.description;
