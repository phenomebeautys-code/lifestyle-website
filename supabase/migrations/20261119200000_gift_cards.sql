-- Gift cards: sold online and issued from the admin. Additive only.
-- RLS on with no policies: only the service role (Edge Functions) reads or writes.
-- Balances only change through the functions below, which lock the card row, so a balance
-- cannot be spent twice. Cards are valid for 3 years (the Consumer Protection Act minimum).

create table if not exists public.gift_cards (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^PB-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  initial_amount    numeric not null check (initial_amount > 0),
  balance           numeric not null check (balance >= 0),
  expires_at        timestamptz not null,
  status            text not null default 'active' check (status in ('active', 'disabled')),
  recipient_name    text check (recipient_name is null or char_length(recipient_name) <= 120),
  recipient_email   text check (recipient_email is null or recipient_email = lower(recipient_email)),
  sender_name       text check (sender_name is null or char_length(sender_name) <= 120),
  message           text check (message is null or char_length(message) <= 500),
  source            text not null check (source in ('online', 'admin')),
  purchase_order_id uuid unique references public.shop_orders(id) on delete set null,
  emailed_at        timestamptz,
  created_at        timestamptz not null default now(),
  created_by        text
);
alter table public.gift_cards enable row level security;

create table if not exists public.gift_card_ledger (
  id         bigint generated always as identity primary key,
  card_id    uuid not null references public.gift_cards(id) on delete cascade,
  at         timestamptz not null default now(),
  change     numeric not null,
  kind       text not null check (kind in ('issue', 'hold', 'release', 'adjust', 'topup')),
  hold_state text check (hold_state in ('held', 'redeemed', 'released')),
  order_id   uuid,
  actor      text,
  note       text
);
create index if not exists gift_card_ledger_card_idx on public.gift_card_ledger (card_id, at desc);
create index if not exists gift_card_ledger_hold_idx on public.gift_card_ledger (order_id) where kind = 'hold';
alter table public.gift_card_ledger enable row level security;

alter table public.shop_orders
  add column if not exists gift_card_id     uuid,
  add column if not exists gift_card_amount numeric not null default 0 check (gift_card_amount >= 0);

-- Online sales are off until the owner switches them on.
insert into public.shop_settings (key, value)
values ('gift_cards', '{"enabled": false, "amounts": [250, 500, 1000]}'::jsonb)
on conflict (key) do nothing;

-- Holds up to p_max_cents on a card for an order. Returns the amount held (rand), or raises.
create or replace function public.gift_card_hold(p_code text, p_order uuid, p_max_cents bigint, p_actor text)
returns table (out_card_id uuid, out_held numeric)
language plpgsql set search_path = public as $$
declare c gift_cards%rowtype; amt numeric;
begin
  select * into c from gift_cards where code = upper(trim(p_code)) for update;
  if not found then raise exception 'GIFT_CARD_NOT_FOUND'; end if;
  if c.status <> 'active' then raise exception 'GIFT_CARD_DISABLED'; end if;
  if c.expires_at <= now() then raise exception 'GIFT_CARD_EXPIRED'; end if;
  amt := least(c.balance, p_max_cents / 100.0);
  if amt <= 0 then raise exception 'GIFT_CARD_EMPTY'; end if;
  update gift_cards set balance = balance - amt where id = c.id;
  insert into gift_card_ledger (card_id, change, kind, hold_state, order_id, actor)
    values (c.id, -amt, 'hold', 'held', p_order, p_actor);
  return query select c.id, amt;
end $$;

-- Gives back any held amount for an order (unpaid, cancelled or failed).
create or replace function public.gift_card_release(p_order uuid, p_note text)
returns numeric
language plpgsql set search_path = public as $$
declare r record; total numeric := 0;
begin
  for r in select * from gift_card_ledger where order_id = p_order and kind = 'hold' and hold_state = 'held' for update loop
    update gift_cards set balance = balance - r.change where id = r.card_id;
    update gift_card_ledger set hold_state = 'released' where id = r.id;
    insert into gift_card_ledger (card_id, change, kind, order_id, actor, note) values (r.card_id, -r.change, 'release', p_order, 'system', p_note);
    total := total - r.change;
  end loop;
  return total;
end $$;

-- Marks the held amount for a paid order as spent.
create or replace function public.gift_card_settle(p_order uuid)
returns void
language sql set search_path = public as $$
  update gift_card_ledger set hold_state = 'redeemed' where order_id = p_order and kind = 'hold' and hold_state = 'held';
$$;

-- Adds to or takes from a balance (admin top-up or correction). The balance cannot go below zero.
create or replace function public.gift_card_adjust(p_card uuid, p_change numeric, p_kind text, p_actor text, p_note text)
returns numeric
language plpgsql set search_path = public as $$
declare b numeric;
begin
  if p_kind not in ('adjust', 'topup') then raise exception 'BAD_KIND'; end if;
  update gift_cards set balance = balance + p_change where id = p_card and balance + p_change >= 0 returning balance into b;
  if not found then raise exception 'GIFT_CARD_BALANCE'; end if;
  insert into gift_card_ledger (card_id, change, kind, actor, note) values (p_card, p_change, p_kind, p_actor, p_note);
  return b;
end $$;

revoke all on function public.gift_card_hold(text, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.gift_card_release(uuid, text) from public, anon, authenticated;
revoke all on function public.gift_card_settle(uuid) from public, anon, authenticated;
revoke all on function public.gift_card_adjust(uuid, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.gift_card_hold(text, uuid, bigint, text) to service_role;
grant execute on function public.gift_card_release(uuid, text) to service_role;
grant execute on function public.gift_card_settle(uuid) to service_role;
grant execute on function public.gift_card_adjust(uuid, numeric, text, text, text) to service_role;
