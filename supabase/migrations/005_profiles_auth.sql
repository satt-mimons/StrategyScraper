-- Per-user profiles, keyed on the Supabase auth user. Replaces the single-tenant
-- `profile` table for the web app. Row Level Security ensures each user can only read
-- and write their own row.

create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  company text not null default '',
  role text not null default '',
  topics text[] not null default '{}',
  tone_spec text not null default '',
  preferred_pubs text[] not null default '{}',
  analyst_firms text[] not null default '{}',
  analyst_firm_domains text[] not null default '{}',
  frequency text not null default 'weekly',
  linkedin_urls text[] not null default '{}',
  substack_urls text[] not null default '{}',
  brand_overrides jsonb not null default '{}'::jsonb,
  recipients text[] not null default '{}',
  reply_to text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- A user may select / insert / update / delete only their own profile row.
drop policy if exists "Users manage own profile" on profiles;
create policy "Users manage own profile"
  on profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
