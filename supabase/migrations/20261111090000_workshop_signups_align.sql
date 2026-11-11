-- Brings the live public.workshop_signups table in line with 20261110090000.
-- The live table was created from an earlier draft and lacked the price, deposit,
-- status and terms columns the workshop-signup function writes. The table had no rows.
-- Additive only: columns, checks and indexes. No data is removed.

alter table public.workshop_signups
  add column if not exists status text not null default 'waitlist',
  add column if not exists kit_price_zar integer,
  add column if not exists terms_accepted_at timestamptz not null default now(),
  add column if not exists terms_version text;

alter table public.workshop_signups
  add column if not exists deposit_zar integer generated always as (kit_price_zar / 2) stored;

alter table public.workshop_signups alter column kit_price_zar set not null;
alter table public.workshop_signups alter column terms_version set not null;

alter table public.workshop_signups drop constraint if exists workshop_signups_status_check;
alter table public.workshop_signups add constraint workshop_signups_status_check
  check (status in ('waitlist', 'payment_link_sent', 'deposit_paid', 'confirmed', 'attended', 'cancelled'));

alter table public.workshop_signups drop constraint if exists workshop_signups_kit_check;
alter table public.workshop_signups add constraint workshop_signups_kit_check
  check (kit in ('foundation', 'precision', 'pro'));

alter table public.workshop_signups drop constraint if exists workshop_signups_kit_price_check;
alter table public.workshop_signups add constraint workshop_signups_kit_price_check
  check (kit_price_zar in (2800, 3500, 4500));

alter table public.workshop_signups drop constraint if exists workshop_signups_experience_check;
alter table public.workshop_signups add constraint workshop_signups_experience_check
  check (waxing_experience in ('beginner', 'self', 'family', 'professional'));

alter table public.workshop_signups drop constraint if exists workshop_signups_days_check;
alter table public.workshop_signups add constraint workshop_signups_days_check
  check (array_length(available_days, 1) >= 1 and available_days <@ array['saturday', 'sunday']::text[]);

alter table public.workshop_signups drop constraint if exists workshop_signups_terms_check;
alter table public.workshop_signups add constraint workshop_signups_terms_check
  check (terms_accepted = true and terms_version = 'waitlist-v1');

alter table public.workshop_signups drop constraint if exists workshop_signups_name_check;
alter table public.workshop_signups add constraint workshop_signups_name_check
  check (char_length(full_name) between 2 and 80);

alter table public.workshop_signups drop constraint if exists workshop_signups_email_check;
alter table public.workshop_signups add constraint workshop_signups_email_check
  check (char_length(email) between 5 and 254);

alter table public.workshop_signups drop constraint if exists workshop_signups_mobile_check;
alter table public.workshop_signups add constraint workshop_signups_mobile_check
  check (char_length(mobile) between 7 and 20);

alter table public.workshop_signups drop constraint if exists workshop_signups_motivation_check;
alter table public.workshop_signups add constraint workshop_signups_motivation_check
  check (char_length(motivation) between 10 and 1000);

alter table public.workshop_signups drop constraint if exists workshop_signups_notes_check;
alter table public.workshop_signups add constraint workshop_signups_notes_check
  check (notes is null or char_length(notes) <= 500);

-- One application per email address, whatever the status.
create unique index if not exists workshop_signups_email_unique on public.workshop_signups (lower(email));
create index if not exists workshop_signups_status_idx on public.workshop_signups (status, created_at desc);
