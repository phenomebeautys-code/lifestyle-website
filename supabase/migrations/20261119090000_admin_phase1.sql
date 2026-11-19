-- Shop admin, Phase 1. Additive only: new tables and new nullable or defaulted columns.
-- Every new table has RLS on and no policies, so only the service role (Edge Functions) can read or write.

-- Staff accounts. One row per Supabase Auth user allowed into the admin.
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique check (email = lower(email)),
  role       text not null default 'owner' check (role in ('owner', 'staff', 'fulfilment')),
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

-- Activity log: who changed what, and when.
create table if not exists public.admin_activity (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text not null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb
);
create index if not exists admin_activity_at_idx on public.admin_activity (at desc);
alter table public.admin_activity enable row level security;

-- Orders: tags, cancel, archive and recorded refunds. payment_status is left as it is,
-- so the payment webhook and other functions keep working unchanged.
alter table public.shop_orders
  add column if not exists tags            text[]      not null default '{}',
  add column if not exists archived_at     timestamptz,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists cancel_reason   text,
  add column if not exists refunded_amount numeric     not null default 0 check (refunded_amount >= 0);

-- Order timeline: notes and every admin change to an order.
create table if not exists public.order_events (
  id       bigint generated always as identity primary key,
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  at       timestamptz not null default now(),
  actor    text not null,
  kind     text not null check (kind in ('note', 'status', 'payment', 'refund', 'cancel', 'archive', 'unarchive', 'tags', 'tracking')),
  message  text,
  data     jsonb
);
create index if not exists order_events_order_idx on public.order_events (order_id, at desc);
alter table public.order_events enable row level security;

-- Customer notes and tags. Customers themselves are built from order history, keyed by email.
create table if not exists public.customer_profiles (
  email      text primary key check (email = lower(email)),
  notes      text check (notes is null or char_length(notes) <= 2000),
  tags       text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.customer_profiles enable row level security;
