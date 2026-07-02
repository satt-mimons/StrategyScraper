-- Scheduled sending for newsletter_configs. A newsletter can auto-generate + email itself on a
-- recurring cadence (weekly/monthly per the existing `frequency` column). The cron worker looks
-- for rows where schedule_enabled and next_send_at <= now(), runs the pipeline, then advances
-- next_send_at via computeNextSendAt() (see src/lib/schedule.ts). "Generate now" is unaffected —
-- it hits the same pipeline directly and does not touch these columns.

alter table newsletter_configs
  -- Master switch. When false the cron worker ignores the row (and it drops out of the index).
  add column if not exists schedule_enabled boolean not null default false,
  -- Day of week the brief goes out, 0=Sunday .. 6=Saturday. Nullable because `daily` frequency
  -- has no anchor day. Required (enforced in app code) for weekly/biweekly/monthly.
  add column if not exists send_day smallint,
  -- Local hour of day (0-23) in `timezone` to send at.
  add column if not exists send_hour smallint not null default 9,
  -- IANA timezone name (e.g. 'America/New_York') the send_day/send_hour are interpreted in.
  add column if not exists timezone text not null default 'America/New_York',
  -- Next UTC instant the pipeline should fire. Computed from schedule + frequency; DST-correct.
  add column if not exists next_send_at timestamptz,
  -- Last UTC instant a scheduled run actually fired, for observability and cadence anchoring.
  add column if not exists last_sent_at timestamptz;

alter table newsletter_configs
  drop constraint if exists newsletter_configs_send_day_range;
alter table newsletter_configs
  add constraint newsletter_configs_send_day_range
    check (send_day is null or (send_day between 0 and 6));

alter table newsletter_configs
  drop constraint if exists newsletter_configs_send_hour_range;
alter table newsletter_configs
  add constraint newsletter_configs_send_hour_range
    check (send_hour between 0 and 23);

-- The cron worker's only query: "which enabled schedules are due?". Partial index keeps it tiny
-- (only enabled rows) and lets the ordered scan on next_send_at stay index-only.
create index if not exists newsletter_configs_due_idx
  on newsletter_configs (next_send_at)
  where schedule_enabled;
