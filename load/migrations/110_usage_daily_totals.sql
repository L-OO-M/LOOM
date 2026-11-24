-- Chapter-wide usage totals (follow-up to 109).
--
-- 109 stores visitors per (day, workspace, route) because a route-level count is
-- the only one that can be read without lying: summing per-route visitors would
-- count one member once per screen. This table answers the other question -
-- "how many distinct people used the chapter on a given day" - by counting from
-- the raw rows once, inside the nightly rollup, where that count is still
-- computable.
--
-- One row per (chapter, day). Daily uniques are deliberately NOT added up
-- across days by the reporting layer: a member active on three days is three
-- visitor-days, not three people. lib/usage.js reports the average instead and
-- says so in the copy.

CREATE TABLE IF NOT EXISTS public.usage_daily_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  visitors integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  signed_in integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_daily_totals_scope_idx
  ON public.usage_daily_totals (tenant_id, day);
CREATE INDEX IF NOT EXISTS usage_daily_totals_tenant_day_idx
  ON public.usage_daily_totals (tenant_id, day DESC);

ALTER TABLE public.usage_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily_totals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.usage_daily_totals;
CREATE POLICY tenant_isolation_policy ON public.usage_daily_totals
  FOR ALL
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loom_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_daily_totals TO loom_app;
  END IF;
END $$;
