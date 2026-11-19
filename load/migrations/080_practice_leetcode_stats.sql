-- Persist the real LeetCode profile counters captured at link time and on every
-- sync, so the practice page can show solved totals, difficulty split, ranking
-- and streak without a network call. Additive and idempotent: existing rows keep
-- '{}' until the next successful check.
ALTER TABLE public.practice_connections
  ADD COLUMN IF NOT EXISTS leetcode_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stats_synced_at timestamptz;
