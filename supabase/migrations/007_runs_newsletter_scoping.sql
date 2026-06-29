-- Scope runs to a newsletter config and its owning user. Previously `runs` had no
-- tenant linkage at all — generation was single-tenant and `getRecentRuns()` returned
-- every run in the database. This adds the FKs needed to show per-newsletter run
-- status on the multi-newsletter dashboard and to RLS-scope run visibility per user.

alter table runs
  add column if not exists newsletter_id uuid references newsletter_configs (id) on delete cascade,
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists runs_newsletter_id_idx on runs (newsletter_id);
create index if not exists runs_user_id_idx on runs (user_id);

alter table runs enable row level security;

drop policy if exists "Users view own runs" on runs;
create policy "Users view own runs"
  on runs
  for select
  to authenticated
  using (auth.uid() = user_id);
