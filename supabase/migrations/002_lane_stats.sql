-- P0: per-lane instrumentation (raw_count, survived_count, error)
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS lane_stats JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN runs.lane_stats IS
  'Array of { lane, raw_count, survived_count, error } per research lane';
