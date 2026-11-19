-- Shop settings the owner changes in the admin. Additive only.
-- RLS on with no policies: only the service role (Edge Functions) reads or writes.
-- The public shop reads the free-delivery rule through the shop-config Edge Function.

create table if not exists public.shop_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.shop_settings enable row level security;

-- Free delivery starts switched off until the owner sets an amount.
insert into public.shop_settings (key, value)
values ('free_delivery', '{"enabled": false, "threshold": null, "methods": ["locker", "door"]}'::jsonb)
on conflict (key) do nothing;
