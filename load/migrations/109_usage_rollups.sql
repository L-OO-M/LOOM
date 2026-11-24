-- Nightly aggregates for the usage dashboard (phase 3 of migration 108).
--
-- Raw page_views / ui_events are pruned after 180 days, so the reporting layer
-- cannot read them directly: it reads these two tables, which are written by
-- lib/usage-rollup.js and are cheap enough to query on every admin page load.
--
-- usage_daily keeps one row per (chapter, day, workspace, route). Distinct
-- visitors are per-route on purpose: summing per-route visitor counts would
-- double-count someone who opened five screens, so any cross-route "people"
-- figure must come from the raw rows, not from a sum of this column.
--
-- tour_daily keeps one row per (chapter, day, tour, version): how many started,
-- finished or skipped, and how many sessions reached each step. Steps are JSON
-- because the step list belongs to the tour, not to the schema.

CREATE TABLE IF NOT EXISTS public.usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  area text NOT NULL DEFAULT 'public',
  path text NOT NULL,
  views integer NOT NULL DEFAULT 0,
  visitors integer NOT NULL DEFAULT 0,
  signed_in integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_daily_scope_idx
  ON public.usage_daily (tenant_id, day, area, path);
CREATE INDEX IF NOT EXISTS usage_daily_tenant_day_idx
  ON public.usage_daily (tenant_id, day DESC);
CREATE INDEX IF NOT EXISTS usage_daily_tenant_path_idx
  ON public.usage_daily (tenant_id, path, day DESC);

CREATE TABLE IF NOT EXISTS public.tour_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  tour text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  started integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tour_daily_scope_idx
  ON public.tour_daily (tenant_id, day, tour, version);
CREATE INDEX IF NOT EXISTS tour_daily_tenant_day_idx
  ON public.tour_daily (tenant_id, day DESC);

ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.usage_daily;
CREATE POLICY tenant_isolation_policy ON public.usage_daily
  FOR ALL
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE public.tour_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_daily FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.tour_daily;
CREATE POLICY tenant_isolation_policy ON public.tour_daily
  FOR ALL
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loom_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_daily TO loom_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_daily TO loom_app;
  END IF;
END $$;
