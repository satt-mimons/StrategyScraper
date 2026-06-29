-- Track pipeline stage on runs so the progress page can show sequential
-- Research → Filter → Write → Design → Deliver steps instead of just queued/running/done/failed.

alter table runs
  add column if not exists stage text not null default 'research'
    check (stage in ('research', 'filter', 'write', 'design', 'deliver'));
