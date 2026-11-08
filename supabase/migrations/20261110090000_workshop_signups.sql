-- Waxing workshop sign-ups from the website form (workshop.html).
-- Written only by the workshop-signup Edge Function (service role).
-- RLS is on with no policies, so the public and authenticated roles cannot read or write.

create table if not exists public.workshop_signups (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  full_name    text not null check (char_length(full_name) between 2 and 80),
  email        text not null check (char_length(email) between 5 and 254),
  phone        text not null check (char_length(phone) between 7 and 20),
  experience   text not null check (experience in ('beginner', 'some', 'professional')),
  notes        text check (notes is null or char_length(notes) <= 500),
  consent      boolean not null check (consent = true),
  source_page  text not null default 'workshop.html'
);

alter table public.workshop_signups enable row level security;

create index if not exists workshop_signups_created_at_idx on public.workshop_signups (created_at desc);
