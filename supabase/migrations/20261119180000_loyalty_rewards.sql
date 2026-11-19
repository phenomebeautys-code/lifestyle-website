-- Loyalty rewards: personal reward codes emailed after a number of orders or an amount spent.
-- Additive: a nullable column, a wider check and one new campaign row (off).

-- A code with customer_email set only works for that email address.
alter table public.discount_codes
  add column if not exists customer_email text check (customer_email is null or customer_email = lower(customer_email));
create index if not exists discount_codes_customer_idx on public.discount_codes (customer_email) where customer_email is not null;

alter table public.email_campaigns drop constraint if exists email_campaigns_key_check;
alter table public.email_campaigns add constraint email_campaigns_key_check
  check (key in ('review_request', 'replenishment', 'loyalty_reward'));

insert into public.email_campaigns (key, settings) values
  ('loyalty_reward', jsonb_build_object(
     'trigger', 'orders',
     'every', 3,
     'reward_kind', 'percent',
     'reward_value', 15,
     'valid_days', 60,
     'delay_days', 1,
     'subject', 'A thank-you from Phenomebeauty, {first_name}',
     'heading', 'Thank you for coming back',
     'body', E'Hi {first_name},\n\nYou are one of our regulars, and we notice. Here is {offer} your next order with your personal code {code}. It is yours alone and works with this email address.\n\nThank you for making yourself a priority.',
     'button_label', 'Use my reward',
     'link', 'https://www.phenomebeauty.co.za/shop'))
on conflict (key) do nothing;

-- Orders a campaign has looked at and decided not to email (unsubscribed, refunded, reordered,
-- not a reward milestone) are recorded as 'skipped', so they are not looked at again.
alter table public.campaign_sends drop constraint if exists campaign_sends_status_check;
alter table public.campaign_sends add constraint campaign_sends_status_check
  check (status in ('sent', 'failed', 'test', 'skipped'));

-- Paid orders a campaign has not handled yet, oldest first. Used by the run-campaigns function.
create or replace function public.campaign_candidates(p_key text, p_since timestamptz, p_cutoff timestamptz, p_limit int)
returns table (id uuid, created_at timestamptz, paid_at timestamptz, customer_name text, customer_email text,
               items jsonb, total_amount numeric, refunded_amount numeric)
language sql stable set search_path = public as $$
  select o.id, o.created_at, o.paid_at, o.customer_name, o.customer_email, o.items, o.total_amount, o.refunded_amount
  from shop_orders o
  where o.payment_status = 'paid' and o.cancelled_at is null
    and o.paid_at >= p_since and o.paid_at <= p_cutoff
    and coalesce(o.customer_email, '') <> ''
    and not exists (select 1 from campaign_sends s where s.campaign = p_key and s.order_id = o.id)
  order by o.paid_at
  limit least(greatest(p_limit, 1), 500);
$$;
revoke all on function public.campaign_candidates(text, timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.campaign_candidates(text, timestamptz, timestamptz, int) to service_role;
