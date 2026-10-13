-- 031_rls_scope: fail-closed tenant isolation across every tenant-scoped table.
--
-- PREREQUISITE (migration 030): the `loom_app` role. The app used to connect as
-- `postgres`, which has rolbypassrls = true. BYPASSRLS outranks FORCE ROW LEVEL
-- SECURITY, so the policies from 025 were never evaluated at all. They were
-- decorative. These policies only bite once traffic runs on loom_app.
--
-- This migration is deliberately INERT until that happens: request handling
-- still uses getSql() (the owner connection), which bypasses RLS. Nothing here
-- can break production. It only makes the policies correct and ready.
--
-- DESIGN (derived from measured data, not guesswork):
--
--   strict (43)  every row belongs to exactly one tenant. Policy is fail-CLOSED:
--                tenant_id::text = current_setting('app.tenant_id', true).
--                When app.tenant_id is unset this evaluates to NULL -> DENY.
--                There is deliberately no "allow when unset" branch; that branch
--                is what made 025 a no-op.
--
--   global (1)   open_source_projects is an intentionally global curated-repo
--                catalogue (6/6 rows NULL). NULL means "any chapter may read
--                this", so the policy allows NULL OR an exact match.
--
--   excluded (5) tenants, tenant_domains, feature_flags, platform_admins,
--                schema_migrations — read during bootstrap, BEFORE any tenant
--                is known, so a policy keyed on app.tenant_id would deadlock
--                tenant resolution. Protecting these with RLS is what makes the
--                whole thing circular.
--
-- NOT included: the 29 tables with no tenant_id column at all (resources,
-- roadmap_nodes, department_memberships, event_registrations, github_events,
-- tenants, ...). They are genuinely global or parent-scoped and are reachable
-- through their owning tenant row.
--
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. audit_logs.tenant_id is never populated: writeAudit() puts the tenant in
--    metadata JSONB instead, so all 53 existing rows are NULL. Backfill from
--    metadata before putting a fail-closed policy on the column.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='audit_logs' AND column_name='tenant_id') THEN
    UPDATE public.audit_logs a
       SET tenant_id = NULLIF(a.metadata->>'tenant_id','')::uuid
     WHERE a.tenant_id IS NULL
       AND a.metadata ? 'tenant_id'
       AND NULLIF(a.metadata->>'tenant_id','') ~ '^[0-9a-fA-F-]{36}$';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Fail-closed policies.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  strict_tables text[] := ARRAY[
    -- measured: every existing row has a tenant_id
    'chapter_profiles','cohort_metrics','contests','departments','dept_reports',
    'events','faqs','forum_threads','helper_profiles','mentor_effectiveness',
    'mentors','notifications','page_views','profiles','projects',
    'resource_progress','roadmap_node_analytics','student_achievements',
    'student_analytics_snapshots','student_daily_activity','student_roadmap_progress',
    'user_profiles','verifiable_credentials','wiki_pages',
    -- no rows yet, but tenant-owned by design (ops, finance, per-student)
    'announcements','budget_heads','certificates','code_snippets','expenses',
    'feature_requests','handover_checklists','help_matches','help_signals',
    'member_contributions','mentor_applications','oss_badges','ranking_events',
    'ranking_scores','skill_badges','sponsorships','student_oss_contributions',
    'volunteer_slots',
    -- backfilled above
    'audit_logs'
  ];
  global_tables text[] := ARRAY['open_source_projects'];
BEGIN
  FOREACH t IN ARRAY strict_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_allow_unset_policy ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON public.%I AS PERMISSIVE
           FOR ALL
           USING (tenant_id::text = current_setting(''app.tenant_id'', true))
           WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY global_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_allow_unset_policy ON public.%I', t);
      -- NULL tenant_id is an intentional global catalogue entry.
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON public.%I AS PERMISSIVE
           FOR ALL
           USING (tenant_id IS NULL OR tenant_id::text = current_setting(''app.tenant_id'', true))
           WITH CHECK (tenant_id IS NULL OR tenant_id::text = current_setting(''app.tenant_id'', true))', t);
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.is_tenant_member(text) IS
  'Legacy helper from 025. Kept for grants only; the fail-closed policies in 031 '
  'do not call it -- it contained an "allow when app.tenant_id is unset" branch, '
  'which is what made the original isolation a no-op.';
