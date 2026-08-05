-- VIP contacts, AI-ranked tasks, and The Loop (waiting-on-others) commitments

create table if not exists public.vip_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  email text,
  identifiers text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vip_contacts_user_id_idx
  on public.vip_contacts (user_id);

create table if not exists public.ranked_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  task text not null,
  source text not null default '',
  priority text not null default 'P2' check (priority in ('P0', 'P1', 'P2', 'P3')),
  reason text not null default '',
  sender text not null default '',
  item_key text,
  sort_order int not null default 0,
  briefing_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ranked_tasks_user_priority_idx
  on public.ranked_tasks (user_id, priority, sort_order);

create unique index if not exists ranked_tasks_user_item_key_idx
  on public.ranked_tasks (user_id, item_key)
  where item_key is not null;

create table if not exists public.loop_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source text not null,
  sender text not null,
  promised_text text not null,
  promised_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'overdue')),
  last_checked_at timestamptz,
  thread_key text,
  message_id text,
  overdue_after_days int not null default 3,
  fulfilled_at timestamptz,
  nudge_draft text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loop_commitments_user_status_idx
  on public.loop_commitments (user_id, status, promised_at);

create unique index if not exists loop_commitments_user_dedupe_idx
  on public.loop_commitments (user_id, source, sender, promised_text, promised_at);

-- Store overdue threshold on users.assistant_settings as loop_overdue_days (int, default 3)

alter table public.vip_contacts enable row level security;
alter table public.ranked_tasks enable row level security;
alter table public.loop_commitments enable row level security;

grant select, insert, update, delete on public.vip_contacts to authenticated;
grant select, insert, update, delete on public.ranked_tasks to authenticated;
grant select, insert, update, delete on public.loop_commitments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vip_contacts' and policyname = 'Users manage own vip contacts'
  ) then
    create policy "Users manage own vip contacts"
      on public.vip_contacts for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ranked_tasks' and policyname = 'Users manage own ranked tasks'
  ) then
    create policy "Users manage own ranked tasks"
      on public.ranked_tasks for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'loop_commitments' and policyname = 'Users manage own loop commitments'
  ) then
    create policy "Users manage own loop commitments"
      on public.loop_commitments for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
