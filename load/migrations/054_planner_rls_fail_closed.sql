-- 054_planner_rls_fail_closed: tighten the planner RLS policies.
--
-- 053 created `planner_weeks` and `planner_sessions` with a fail-OPEN copy of
-- the original 025-era policy, which lets a query whose `app.tenant_id` is unset
-- (or empty) read every tenant's planner rows. Migration 031 moved the whole
-- schema to the fail-CLOSED expression, and 042 keeps that shape for new tables.
-- This migration brings the two planner tables onto the same standard so tenant
-- isolation is not weaker for the newest surface in the app.
--
-- Append-only: 053 stays as applied; this re-creates both policies. Idempotent —
-- safe to run repeatedly (DROP POLICY IF EXISTS + CREATE POLICY).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['planner_weeks', 'planner_sessions'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON public.%I AS PERMISSIVE
           FOR ALL
           USING (tenant_id::text = current_setting(''app.tenant_id'', true))
           WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t);
    END IF;
  END LOOP;
END $$;
