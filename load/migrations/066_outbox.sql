-- 066_outbox: a durable queue for side effects that must not run inline.
--
-- Why a table instead of a service: no paid queue is approved, the app already
-- has a cron-authenticated job runner (`GET /api/jobs/run` -> lib/scheduler.js),
-- and the enqueue has to be able to join the caller's transaction. A row in
-- Postgres gives all three for free.
--
-- Contract:
--   * enqueue INSIDE the business transaction, never after commit. The event and
--     the write then commit or roll back together: no "row written, event lost"
--     window and no "event queued, row rolled back" phantom.
--   * `dedupe_key` makes a retried enqueue a no-op (partial unique index), which
--     is what lets a route retry safely.
--   * the drainer claims with FOR UPDATE SKIP LOCKED so two drains never take
--     the same row, and reclaims rows stuck in `processing` so a crashed drain
--     cannot strand work.
--   * `attempts` drives backoff; a row that exhausts MAX_ATTEMPTS becomes `dead`
--     with `last_error` retained rather than being dropped.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.outbox (
  id           bigserial PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  topic        text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key   text,
  status       text NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT outbox_status_check
    CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  CONSTRAINT outbox_attempts_check CHECK (attempts >= 0)
);

-- A retried enqueue with the same key is a no-op instead of a duplicate side
-- effect. Matches the predicate of the partial index below.
CREATE UNIQUE INDEX IF NOT EXISTS outbox_topic_dedupe_unique
  ON public.outbox (topic, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- The drainer's only access path: oldest due work first.
CREATE INDEX IF NOT EXISTS outbox_drain_idx
  ON public.outbox (available_at ASC, id ASC)
  WHERE status = 'pending';

-- Stale-lock reclamation scans `processing` rows by lock age.
CREATE INDEX IF NOT EXISTS outbox_processing_idx
  ON public.outbox (locked_at ASC)
  WHERE status = 'processing';

-- Retention pruning scans by status + completion time (7d done / 30d dead).
CREATE INDEX IF NOT EXISTS outbox_retention_idx
  ON public.outbox (status, completed_at)
  WHERE status IN ('done', 'dead');

-- Same strict, fail-closed policy as every other tenant-owned table (031).
-- The app's current connection has rolbypassrls = true, so this is not what
-- enforces isolation today -- it is correct the moment the RLS rollout switches
-- request handling onto the NOBYPASSRLS app role.
ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.outbox;
CREATE POLICY tenant_isolation_policy ON public.outbox AS PERMISSIVE
  FOR ALL
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
