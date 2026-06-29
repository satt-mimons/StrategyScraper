-- Per-user newsletter configs. A user may own multiple newsletter configs (e.g. one per
-- company/audience), replacing the single-profile-per-user model from 005.
-- Row Level Security ensures each user can only read and write their own rows.

create table if not exists newsletter_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  company text not null default '',
  role text not null default '',
  frequency text not null default 'weekly',
  topics text[] not null default '{}',
  tone_preset text not null default '',
  tone_custom text not null default '',
  recipients text[] not null default '{}',
  reply_to text not null default '',
  preferred_publications text[] not null default '{}',
  substack_urls text[] not null default '{}',
  linkedin_urls text[] not null default '{}',
  primary_color text not null default '',
  accent_color text not null default '',
  logo_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists newsletter_configs_user_id_idx on newsletter_configs (user_id);

alter table newsletter_configs enable row level security;

-- A user may select / insert / update / delete only their own newsletter rows.
drop policy if exists "Users manage own newsletters" on newsletter_configs;
create policy "Users manage own newsletters"
  on newsletter_configs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
