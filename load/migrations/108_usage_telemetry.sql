-- First-party usage telemetry and per-account tour state.
--
-- page_views shipped in 022 but nothing ever wrote to it, so "which pages do
-- students actually use" had no answer. The columns below let one row carry the
-- session, workspace and role that produced it; ui_events carries the small set
-- of interactions a page view cannot express (tour start/step/finish/skip).
--
-- Aggregates are what the admin surfaces read. Raw rows are pruned after 180
-- days by load/prune-retention.js, so this is not an unbounded log.
--
-- No new PII: paths are normalized (query strings and ids removed), there is no
-- free text, and anonymous visitors are identified only by a daily-rotating
-- salted hash (lib/telemetry.js). Signed-in rows use the existing profile id.

ALTER TABLE public.page_views
  ADD COLUMN IF NOT EXISTS session_key text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS role text;

CREATE INDEX IF NOT EXISTS page_views_tenant_path_idx
  ON public.page_views (tenant_id, path, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ui_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text,
  session_key text,
  area text,
  path text NOT NULL DEFAULT '/',
  event text NOT NULL,
  target text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ui_events_event_check CHECK (
    event IN ('tour_start', 'tour_step', 'tour_complete', 'tour_skip')
  )
);

CREATE INDEX IF NOT EXISTS ui_events_tenant_time_idx
  ON public.ui_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ui_events_tenant_event_idx
  ON public.ui_events (tenant_id, event, created_at DESC);
CREATE INDEX IF NOT EXISTS ui_events_user_idx
  ON public.ui_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tour_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analytics_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.tour_state IS
  'Completed product-tour versions by tour id, e.g. {"student": 1}. Written only by /api/telemetry.';
COMMENT ON COLUMN public.profiles.analytics_opt_out IS
  'When true the account is excluded from first-party usage telemetry. Aggregate public traffic still counts, with no link to the account.';

-- Same fail-closed tenant policy as 031. ui_events is a new table, so 030's
-- "all tables" grant did not cover it.
ALTER TABLE public.ui_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.ui_events;
CREATE POLICY tenant_isolation_policy ON public.ui_events
  FOR ALL
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loom_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_events TO loom_app;
  END IF;
END $$;
