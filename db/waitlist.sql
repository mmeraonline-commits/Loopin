-- Waitlist signups from the landing page
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'landing',
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_unique unique (email)
);

alter table public.waitlist_signups enable row level security;

-- Server uses admin key; no public anon writes needed via RLS
