-- Waxing workshop waitlist: applications from the website form (workshop.html).
-- Written only by the workshop-signup Edge Function (service role).
-- RLS is on with no policies, so the public and authenticated roles cannot read or write.

create table if not exists public.workshop_signups (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  status             text not null default 'waitlist'
                       check (status in ('waitlist', 'payment_link_sent', 'deposit_paid', 'confirmed', 'attended', 'cancelled')),
  full_name          text not null check (char_length(full_name) between 2 and 80),
  email              text not null check (char_length(email) between 5 and 254),
  mobile             text not null check (char_length(mobile) between 7 and 20),
  waxing_experience  text not null check (waxing_experience in ('beginner', 'self', 'family', 'professional')),
  motivation         text not null check (char_length(motivation) between 10 and 1000),
  available_days     text[] not null check (array_length(available_days, 1) >= 1 and available_days <@ array['saturday', 'sunday']::text[]),
  kit                text not null check (kit in ('foundation', 'precision', 'pro')),
  kit_price_zar      integer not null check (kit_price_zar in (2800, 3500, 4500)),
  deposit_zar        integer generated always as (kit_price_zar / 2) stored,
  notes              text check (notes is null or char_length(notes) <= 500),
  terms_accepted     boolean not null check (terms_accepted = true),
  terms_accepted_at  timestamptz not null default now(),
  terms_version      text not null check (terms_version = 'waitlist-v1'),
  source_page        text not null default 'workshop.html'
);

-- One application per email address, whatever the status.
create unique index if not exists workshop_signups_email_unique on public.workshop_signups (lower(email));
create index if not exists workshop_signups_status_idx on public.workshop_signups (status, created_at desc);

alter table public.workshop_signups enable row level security;
