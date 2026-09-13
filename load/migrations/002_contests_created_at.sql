-- 002_contests_created_at: contests table predates created_at used by ordering
-- Tracked migration. Apply with: node load/migrate.js
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
