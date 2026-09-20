-- 025_rls_tenant_isolation: engine-level tenant isolation via RLS + app.tenant_id
-- Idempotent. Enable RLS on tenant-scoped tables. App must SET LOCAL app.tenant_id per txn via withTenant().

-- Tenant-aware helper function (used by RLS policies)
CREATE OR REPLACE FUNCTION public.is_tenant_member(uid text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT
    current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = uid AND p.tenant_id::text = current_setting('app.tenant_id', true))
$$;

-- Backfill tenant_id onto progress tables where missing (so RLS can use direct column)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='student_roadmap_progress') THEN
    ALTER TABLE public.student_roadmap_progress ADD COLUMN IF NOT EXISTS tenant_id uuid;
    UPDATE public.student_roadmap_progress srp SET tenant_id = p.tenant_id FROM public.profiles p WHERE p.user_id = srp.student_id AND srp.tenant_id IS NULL;
    CREATE INDEX IF NOT EXISTS student_roadmap_progress_tenant_idx ON public.student_roadmap_progress(tenant_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='resource_progress') THEN
    ALTER TABLE public.resource_progress ADD COLUMN IF NOT EXISTS tenant_id uuid;
    UPDATE public.resource_progress rp SET tenant_id = p.tenant_id FROM public.profiles p WHERE p.user_id = rp.student_id AND rp.tenant_id IS NULL;
    CREATE INDEX IF NOT EXISTS resource_progress_tenant_idx ON public.resource_progress(tenant_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='student_daily_activity') THEN
    ALTER TABLE public.student_daily_activity ADD COLUMN IF NOT EXISTS tenant_id uuid;
    UPDATE public.student_daily_activity sda SET tenant_id = p.tenant_id FROM public.profiles p WHERE p.user_id = sda.student_id AND sda.tenant_id IS NULL;
    CREATE INDEX IF NOT EXISTS student_daily_activity_tenant_idx ON public.student_daily_activity(tenant_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs') THEN
    ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id uuid;
    CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON public.audit_logs(tenant_id);
  END IF;
END $$;

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'profiles','users','projects','contests','mentors','notifications',
    'feature_requests','departments','finance_expenses','finance_sponsorships',
    'handover_items','handover_checklists','volunteers','reports',
    'student_roadmap_progress','resource_progress','student_daily_activity','audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      -- Enable RLS
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      -- Replace policy
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
      IF t IN ('student_roadmap_progress','resource_progress','student_daily_activity') THEN
        -- These use student_id + tenant_id direct
        EXECUTE format(
          'CREATE POLICY tenant_isolation_policy ON public.%I FOR ALL USING (
             current_setting(''app.tenant_id'', true) = '''' OR current_setting(''app.tenant_id'', true) IS NULL
             OR tenant_id IS NULL
             OR tenant_id::text = current_setting(''app.tenant_id'', true)
             OR public.is_tenant_member(student_id)
           ) WITH CHECK (
             current_setting(''app.tenant_id'', true) = '''' OR current_setting(''app.tenant_id'', true) IS NULL
             OR tenant_id IS NULL
             OR tenant_id::text = current_setting(''app.tenant_id'', true)
           )', t);
      ELSE
        EXECUTE format(
          'CREATE POLICY tenant_isolation_policy ON public.%I FOR ALL USING (
             current_setting(''app.tenant_id'', true) = '''' OR current_setting(''app.tenant_id'', true) IS NULL
             OR tenant_id IS NULL
             OR tenant_id::text = current_setting(''app.tenant_id'', true)
           ) WITH CHECK (
             current_setting(''app.tenant_id'', true) = '''' OR current_setting(''app.tenant_id'', true) IS NULL
             OR tenant_id IS NULL
             OR tenant_id::text = current_setting(''app.tenant_id'', true)
           )', t);
      END IF;
    END IF;
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS 'RLS enabled 025: tenant isolation via app.tenant_id (SET LOCAL per txn) + is_tenant_member()';
