-- 073_people_ops: account status, per-role checklists, and mentor-session ops.
--
-- WHY THIS EXISTS
-- Roles and terms are assigned, but nothing operational surrounds them: there
-- is no way to suspend an account, no onboarding/offboarding evidence, and no
-- place to see what a departing member still owes the chapter. Suspension must
-- take effect on the next request, not on the next login.
--
-- Additive and idempotent. Existing accounts stay 'active'. Nothing is deleted:
-- a suspended/deactivated account keeps its profile, history, and audit trail.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_account_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'suspended', 'deactivated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_tenant_status_idx
  ON public.profiles(tenant_id, account_status);

-- One row per checklist item a human has actually ticked. Absence means "not
-- done", so a template can gain an item without a backfill.
CREATE TABLE IF NOT EXISTS public.people_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  kind text NOT NULL,
  role text NOT NULL,
  item_key text NOT NULL,
  done boolean NOT NULL DEFAULT true,
  done_at timestamptz,
  done_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT people_checklist_kind_check CHECK (kind IN ('onboarding', 'offboarding')),
  CONSTRAINT people_checklist_role_check CHECK (
    role IN ('student', 'core', 'dept_lead', 'vertical_lead', 'admin')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS people_checklist_item_key
  ON public.people_checklist_items(tenant_id, user_id, kind, role, item_key);
CREATE INDEX IF NOT EXISTS people_checklist_user_idx
  ON public.people_checklist_items(tenant_id, user_id, kind);

DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY['people_checklist_items'];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
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

DO $$
BEGIN
  BEGIN EXECUTE 'REVOKE ALL ON TABLE public.people_checklist_items FROM PUBLIC'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'REVOKE ALL ON TABLE public.people_checklist_items FROM anon'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'REVOKE ALL ON TABLE public.people_checklist_items FROM authenticated'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

COMMENT ON COLUMN public.profiles.account_status IS
  'active | suspended | deactivated. Suspended/deactivated accounts lose access on the next request; only an explicit admin action restores active.';
COMMENT ON COLUMN public.profiles.status_reason IS
  'Human-readable reason for the current non-active status. Never cleared by a role change.';
COMMENT ON TABLE public.people_checklist_items IS
  'Manual completion state for per-role onboarding/offboarding checklists. Templates live in lib/people.js.';
