alter table public.products
  add column if not exists stock_on_hand numeric not null default 0,
  add column if not exists reorder_level numeric not null default 0,
  add column if not exists reorder_quantity numeric not null default 0,
  add column if not exists stock_status text not null default 'in_stock';

alter table public.products
  add constraint products_stock_status_check
  check (stock_status in ('in_stock', 'low_stock', 'out_of_stock', 'discontinued'));

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id),
  movement_type text not null check (movement_type in ('initial_stock', 'purchase', 'sale', 'adjustment', 'damaged', 'returned', 'correction')),
  quantity numeric not null check (quantity <> 0),
  stock_before numeric not null,
  stock_after numeric not null,
  reference_type text,
  reference_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_product_created_idx
  on public.inventory_movements(product_id, created_at desc);

create unique index if not exists inventory_sale_order_product_unique
  on public.inventory_movements(reference_type, reference_id, product_id)
  where movement_type = 'sale';

alter table public.inventory_movements enable row level security;

create policy inventory_movements_service_role_only
  on public.inventory_movements
  for all
  to service_role
  using (true)
  with check (true);
