-- Marketing: discount codes and email campaigns, all run from the admin. Additive only.
-- Every new table has RLS on and no policies: only the service role (Edge Functions) can read or write.

-- Discount codes the owner creates in the admin.
create table if not exists public.discount_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,29}$'),
  kind              text not null check (kind in ('percent', 'fixed', 'free_delivery')),
  value             numeric not null default 0 check (value >= 0),
  min_subtotal      numeric not null default 0 check (min_subtotal >= 0),
  starts_at         timestamptz,
  ends_at           timestamptz,
  max_uses          integer check (max_uses is null or max_uses > 0),
  once_per_customer boolean not null default false,
  active            boolean not null default true,
  campaign          text check (campaign is null or char_length(campaign) <= 80),
  note              text check (note is null or char_length(note) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        text,
  check (kind <> 'percent' or (value > 0 and value <= 90)),
  check (kind <> 'fixed' or value > 0),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table public.discount_codes enable row level security;

-- The code and amount an order used. Set only by create-order.
alter table public.shop_orders
  add column if not exists discount_code   text,
  add column if not exists discount_amount numeric not null default 0 check (discount_amount >= 0);
create index if not exists shop_orders_discount_code_idx on public.shop_orders (discount_code) where discount_code is not null;

-- Automated email campaigns. Off until the owner switches them on.
-- enabled_at: only orders paid after a campaign was switched on are emailed, so turning one on
-- never emails the whole back catalogue of customers at once.
create table if not exists public.email_campaigns (
  key        text primary key check (key in ('review_request', 'replenishment')),
  enabled    boolean not null default false,
  enabled_at timestamptz,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.email_campaigns enable row level security;

insert into public.email_campaigns (key, settings) values
  ('review_request', jsonb_build_object(
     'delay_days', 7,
     'subject', 'How are you finding your PhenomeBeauty order?',
     'heading', 'We would love your thoughts',
     'body', E'Hi {first_name},\n\nWe hope you are enjoying your {products}. If you have a minute, a short Google review helps other people find us and means a lot to a small business.\n\nThank you for making yourself a priority.',
     'button_label', 'Leave a Google review',
     'link', 'https://g.page/r/CSCXyIIoURUJEBM/review')),
  ('replenishment', jsonb_build_object(
     'delay_days', 45,
     'subject', 'Running low on your {first_product}?',
     'heading', 'Time for a top-up?',
     'body', E'Hi {first_name},\n\nIt has been a few weeks since your {products} arrived, so you may be running low. Restock before you run out and keep your ritual going.',
     'button_label', 'Shop again',
     'link', 'https://www.phenomebeauty.co.za/shop',
     'discount_code', null))
on conflict (key) do nothing;

-- One row per email a campaign sent (or tried to). The unique key stops an order being emailed twice.
create table if not exists public.campaign_sends (
  id        bigint generated always as identity primary key,
  campaign  text not null,
  order_id  uuid references public.shop_orders(id) on delete cascade,
  email     text not null,
  sent_at   timestamptz not null default now(),
  status    text not null check (status in ('sent', 'failed', 'test')),
  detail    text,
  unique (campaign, order_id)
);
create index if not exists campaign_sends_sent_idx on public.campaign_sends (sent_at desc);
alter table public.campaign_sends enable row level security;

-- Customers who unsubscribed from marketing emails. Order emails are not affected.
create table if not exists public.email_optouts (
  email  text primary key check (email = lower(email)),
  at     timestamptz not null default now(),
  source text
);
alter table public.email_optouts enable row level security;
