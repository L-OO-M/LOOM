-- 062_webhook_processed_state: make GitHub delivery processing resumable and
-- notification fan-out idempotent.
--
-- WHY THIS EXISTS
--
-- The webhook used to insert a github_events row and treat "the row is new" as
-- "the delivery was processed". The insert committed BEFORE any side effect ran,
-- so a process killed or a request that timed out after the insert permanently
-- skipped aggregation for that delivery: GitHub redelivered it, the insert
-- conflicted, and every later attempt took the duplicate branch.
--
-- The row is now the durable work item. It carries a status, an attempt count,
-- a lease timestamp and a next-attempt time. The webhook claims the row
-- atomically, runs the fan-out, then marks it processed. A failure marks it
-- failed with a backoff so a redelivery can resume; side effects are written to
-- be idempotent, and the daily activity aggregate is claimed in its own
-- transaction (activity_applied_at) so a retry cannot count the same push twice.
--
-- Existing rows were genuinely processed by the old code, so the column is
-- added with DEFAULT 'processed' and the default is then changed to 'pending'
-- for new inserts. Re-running this migration does not mark new pending rows as
-- processed: ADD COLUMN IF NOT EXISTS is a no-op after the first run.
--
-- Idempotent throughout.

-- ---------------------------------------------------------------------------
-- 1. github_events: durable processed state
-- ---------------------------------------------------------------------------
ALTER TABLE public.github_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed';

-- New deliveries start pending. Existing rows above keep 'processed'.
ALTER TABLE public.github_events ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.github_events
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.github_events
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.github_events
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.github_events
  ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.github_events
  ADD COLUMN IF NOT EXISTS next_attempt timestamptz;
-- The aggregate has its own claim marker, separate from the delivery status:
-- it lets a retry resume other fan-out work without adding the same commits,
-- PRs and reviews to student_daily_activity a second time.
ALTER TABLE public.github_events
  ADD COLUMN IF NOT EXISTS activity_applied_at timestamptz;

-- Existing rows were processed synchronously by the previous implementation.
UPDATE public.github_events
   SET processed_at = COALESCE(processed_at, received_at)
 WHERE status = 'processed'
   AND processed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'github_events_status_check'
       AND conrelid = 'public.github_events'::regclass
  ) THEN
    ALTER TABLE public.github_events ADD CONSTRAINT github_events_status_check
      CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'github_events_attempts_check'
       AND conrelid = 'public.github_events'::regclass
  ) THEN
    ALTER TABLE public.github_events ADD CONSTRAINT github_events_attempts_check
      CHECK (attempts >= 0);
  END IF;
END $$;

-- The retry worker (and any future outbox drainer) reads "what can be claimed
-- now?" -- that is pending rows and failed rows whose backoff has elapsed.
CREATE INDEX IF NOT EXISTS github_events_retry_idx
  ON public.github_events (status, next_attempt)
  WHERE status IN ('pending', 'failed');

-- Stale-processing recovery: a crashed process leaves status='processing' with
-- an old claimed_at; a redelivery after the lease can claim it again.
CREATE INDEX IF NOT EXISTS github_events_processing_lease_idx
  ON public.github_events (claimed_at)
  WHERE status = 'processing';

COMMENT ON COLUMN public.github_events.status IS
  'Durable delivery state: pending -> processing -> processed, or failed (retryable) / dead (attempts exhausted). The row is the work item, not merely a dedupe marker.';
COMMENT ON COLUMN public.github_events.claimed_at IS
  'When the current processor claimed the row. A processing row older than the lease can be reclaimed after a crash or timeout.';
COMMENT ON COLUMN public.github_events.activity_applied_at IS
  'Set inside the same transaction that adds this delivery to student_daily_activity, so a retry cannot aggregate the same commits/PRs/reviews twice.';

-- ---------------------------------------------------------------------------
-- 2. notifications: stable dedupe key
-- ---------------------------------------------------------------------------
-- Webhook fan-out may run more than once (redelivery, crash after a side
-- effect, stale lease). A notification created by that fan-out must land at
-- most once. Existing notification writers leave this NULL and are unaffected:
-- the unique index is partial.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key_idx
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Stable per-notification key for writers that can be retried (currently GitHub webhook fan-out). NULL for ordinary notifications, which the partial unique index excludes.';
