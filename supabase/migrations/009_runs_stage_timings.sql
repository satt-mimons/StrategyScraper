-- Internal troubleshooting: per-step wall-clock durations for a run, so we can see where the
-- pipeline spends its 300s budget (esp. the sequential write stage). Not surfaced in the UI.

alter table runs
  add column if not exists stage_timings jsonb not null default '[]';

comment on column runs.stage_timings is
  'Array of { step, ms } per pipeline step (research, cluster, filter, write:reporter, write:editor, design, deliver). Diagnostics only — not shown in the UI.';
