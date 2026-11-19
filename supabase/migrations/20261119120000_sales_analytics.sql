-- Sales analytics. Additive only.
-- site_events holds anonymous visit events from the public site: no names, emails, IP addresses or cookies.
-- A visit is identified by a random id kept in the browser tab (sessionStorage) and forgotten when the tab closes.
-- RLS is on with no policies: only the service role (the `track` and `shop-admin` Edge Functions) can read or write.

create table if not exists public.site_events (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  session_id    text not null check (char_length(session_id) between 8 and 64),
  event         text not null check (event in ('page_view', 'product_view', 'add_to_cart', 'checkout_start')),
  path          text check (char_length(path) <= 200),
  product_id    text check (char_length(product_id) <= 64),
  order_id      uuid,
  channel       text check (channel in ('direct', 'search', 'social', 'email', 'paid', 'referral', 'whatsapp')),
  source        text check (char_length(source) <= 80),
  campaign      text check (char_length(campaign) <= 80),
  landing_path  text check (char_length(landing_path) <= 200),
  device        text check (device in ('mobile', 'tablet', 'desktop'))
);
create index if not exists site_events_at_idx on public.site_events (at desc);
create index if not exists site_events_session_idx on public.site_events (session_id);
create index if not exists site_events_order_idx on public.site_events (order_id) where order_id is not null;
alter table public.site_events enable row level security;

-- One report for the admin Analytics page, worked out in the database so it is not limited by API row caps.
-- Paid orders: payment_status 'paid' and not cancelled. Revenue is net of recorded refunds.
create or replace function public.admin_sales_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
with
paid as (
  select o.*, (o.total_amount - coalesce(o.refunded_amount, 0)) as net
  from shop_orders o
  where o.payment_status = 'paid' and o.cancelled_at is null
    and o.created_at >= p_from and o.created_at < p_to
),
ev as (
  select * from site_events where at >= p_from and at < p_to
),
-- Each visit's first known channel, source and landing page.
sess as (
  select distinct on (session_id) session_id, channel, source, campaign, landing_path, device
  from ev
  where channel is not null
  order by session_id, at
),
sess_flags as (
  select e.session_id,
         bool_or(e.event = 'product_view') as viewed,
         bool_or(e.event = 'add_to_cart')  as carted,
         bool_or(e.event = 'checkout_start') as checkout
  from ev e group by e.session_id
),
-- Orders started in a tracked visit, matched to that visit.
order_sess as (
  select distinct on (e.order_id) e.order_id, e.session_id
  from ev e where e.event = 'checkout_start' and e.order_id is not null
  order by e.order_id, e.at
),
paid_sess as (
  select p.id, p.net, os.session_id, coalesce(s.channel, 'untracked') as channel
  from paid p
  left join order_sess os on os.order_id = p.id
  left join sess s on s.session_id = os.session_id
),
prior_buyers as (
  select distinct lower(customer_email) as email
  from shop_orders
  where payment_status = 'paid' and cancelled_at is null and created_at < p_from and customer_email is not null
),
lines as (
  select (item->>'productId') as product_id, coalesce(item->>'name', 'Unknown') as name,
         coalesce((item->>'qty')::numeric, 1) as qty, coalesce((item->>'price')::numeric, 0) as price
  from paid p, jsonb_array_elements(case when jsonb_typeof(p.items) = 'array' then p.items else '[]'::jsonb end) item
),
product_events as (
  select product_id,
         count(distinct session_id) filter (where event = 'product_view') as views,
         count(distinct session_id) filter (where event = 'add_to_cart')  as carts
  from ev where product_id is not null group by product_id
)
select jsonb_build_object(
  'from', p_from, 'to', p_to,
  'totals', (select jsonb_build_object(
      'orders', count(*),
      'revenue', coalesce(sum(net), 0),
      'gross', coalesce(sum(total_amount), 0),
      'refunds', coalesce(sum(refunded_amount), 0),
      'aov', case when count(*) > 0 then round(sum(net) / count(*), 2) else 0 end,
      'customers', count(distinct lower(customer_email)),
      'returning_orders', count(*) filter (where lower(customer_email) in (select email from prior_buyers))
    ) from paid),
  'unpaid_checkouts', (select count(*) from shop_orders where payment_status <> 'paid' and cancelled_at is null
                         and created_at >= p_from and created_at < p_to),
  'funnel', (select jsonb_build_object(
      'sessions', count(*),
      'viewed_product', count(*) filter (where viewed),
      'added_to_cart', count(*) filter (where carted),
      'started_checkout', count(*) filter (where checkout),
      'purchased', (select count(distinct session_id) from paid_sess where session_id is not null)
    ) from sess_flags),
  'channels', coalesce((select jsonb_agg(c order by c->>'channel') from (
      select jsonb_build_object(
        'channel', ch,
        'sessions', (select count(*) from sess where sess.channel = ch),
        'orders', (select count(*) from paid_sess where paid_sess.channel = ch),
        'revenue', (select coalesce(sum(net), 0) from paid_sess where paid_sess.channel = ch)
      ) c
      from (select channel as ch from sess union select channel from paid_sess) chans
    ) x), '[]'::jsonb),
  'sources', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'campaign', campaign, 'sessions', n) order by n desc)
      from (select source, campaign, count(*) n from sess where source is not null group by source, campaign order by n desc limit 15) s), '[]'::jsonb),
  'landing_pages', coalesce((select jsonb_agg(jsonb_build_object('path', landing_path, 'sessions', n) order by n desc)
      from (select landing_path, count(*) n from sess where landing_path is not null group by landing_path order by n desc limit 10) s), '[]'::jsonb),
  'devices', coalesce((select jsonb_object_agg(device, n) from (select device, count(*) n from sess where device is not null group by device) d), '{}'::jsonb),
  'products', coalesce((select jsonb_agg(r order by (r->>'revenue')::numeric desc, (r->>'views')::int desc) from (
      select jsonb_build_object(
        'product_id', coalesce(l.product_id, pe.product_id),
        'name', coalesce(l.name, pr.name, pe.product_id),
        'units', coalesce(l.units, 0),
        'revenue', coalesce(l.revenue, 0),
        'views', coalesce(pe.views, 0),
        'carts', coalesce(pe.carts, 0)
      ) r
      from (select product_id, max(name) as name, sum(qty) as units, sum(qty * price) as revenue from lines group by product_id) l
      full join product_events pe on pe.product_id = l.product_id
      left join products pr on pr.id::text = coalesce(l.product_id, pe.product_id)
    ) x), '[]'::jsonb),
  'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'orders', coalesce(o.n, 0), 'revenue', coalesce(o.rev, 0), 'sessions', coalesce(s.n, 0)) order by d)
      from generate_series(date_trunc('day', p_from at time zone 'Africa/Johannesburg'),
                           date_trunc('day', (p_to - interval '1 second') at time zone 'Africa/Johannesburg'), interval '1 day') d
      left join (select date_trunc('day', created_at at time zone 'Africa/Johannesburg') as dday, count(*) as n, sum(net) as rev from paid group by 1) o on o.dday = d
      left join (select date_trunc('day', at at time zone 'Africa/Johannesburg') as dday, count(distinct session_id) as n from ev group by 1) s on s.dday = d
    ), '[]'::jsonb)
);
$$;

revoke all on function public.admin_sales_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_sales_report(timestamptz, timestamptz) to service_role;
