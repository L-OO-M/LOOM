-- 092_github_contribution_calendar: record GitHub's own contribution calendar
-- so the grid reflects real contributions, not only webhook deliveries.
--
-- WHY THIS EXISTS
-- `student_daily_activity` is written by webhook deliveries. A member can be
-- linked for months and still show an empty grid because their hook was never
-- installed, because the chapter enabled ingestion after they started
-- contributing, or because their work happens in repositories outside the
-- chapter's watched set. GitHub already publishes those same days on every
-- profile's contribution calendar, and the OAuth token carries `read:user`, so
-- one GraphQL query per sync can fill them in.
--
-- The calendar is stored in its own column and merged with GREATEST, never
-- added: a push is both a commit and a contribution, and summing the two
-- sources would double every day the webhook already saw. Webhook counters
-- stay the source for commits / pull requests / reviews; this column is the
-- per-day floor GitHub itself attests to.
--
-- Additive and idempotent.

ALTER TABLE public.student_daily_activity
  ADD COLUMN IF NOT EXISTS github_contributions integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_daily_activity_github_contributions_check'
      AND conrelid = 'public.student_daily_activity'::regclass
  ) THEN
    ALTER TABLE public.student_daily_activity
      ADD CONSTRAINT student_daily_activity_github_contributions_check
      CHECK (github_contributions >= 0);
  END IF;
END $$;

-- When the calendar was last read from GitHub. Lets the page say how fresh the
-- grid is without guessing, and lets a backfill be skipped when it just ran.
ALTER TABLE public.github_connections
  ADD COLUMN IF NOT EXISTS contributions_synced_at timestamptz;
