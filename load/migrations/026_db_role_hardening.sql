-- 026_db_role_hardening: revoke public access, lock down anon/authenticated
-- Idempotent. Does NOT revoke from table owners (postgres/service_role) so app pooler keeps access.
-- Combined with 025 RLS, this ensures even if DATABASE_URL leaks to anon, RLS still blocks cross-tenant.

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'profiles','users','tenants','departments','department_memberships',
    'projects','resources','resource_progress','roadmap_nodes','roadmap_edges',
    'student_roadmap_progress','student_daily_activity','contests','contest_registrations','contest_submissions',
    'mentors','notifications','feature_requests','feature_request_comments',
    'audit_logs','github_events','finance_expenses','finance_sponsorships','handover_items','handover_checklists','volunteers','reports'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      -- Revoke from PUBLIC and Supabase anon/authenticated roles if they exist
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      -- Ensure sequences also revoked
      BEGIN
        EXECUTE format('REVOKE ALL ON SEQUENCE public.%I_id_seq FROM PUBLIC, anon, authenticated', t);
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;
END $$;

-- Lock down schema usage: only postgres/service_role can create
DO $$ BEGIN
  BEGIN
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    REVOKE CREATE ON SCHEMA public FROM anon;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    REVOKE CREATE ON SCHEMA public FROM authenticated;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

COMMENT ON SCHEMA public IS '026 hardened: REVOKE PUBLIC/anon/authenticated + RLS 025 active';
