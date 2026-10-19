-- 048_governance_terms: founder permanence, annual terms, and scoped finance.
--
-- WHY THIS EXISTS
-- Roles used to be permanent once granted. The chapter's model is: founder
-- platform admins are permanent, but every other leadership position is held
-- for a term (one academic year by default) and must be reappointed. The
-- permission matrix already had scoped powers, but nothing recorded when a
-- position started or ended.
--
-- This migration is additive and idempotent. It does NOT expire, demote, or
-- rewrite any existing role: existing leaders keep `role_term_end = NULL`
-- (grandfathered) until they are appointed again through the admin API.
--
-- leadership_terms is the immutable history. The live role still lives on
-- profiles (global role) and department_memberships (department position) so
-- every permission check stays a single row lookup.

-- Founder seats. `locked` means role-change APIs must refuse to touch the
-- account. Existing rows become founders (true) because the only way a row
-- exists today is the one-time first claim.
ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS label text;

-- Global role term. NULL = grandfathered / no expiry.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_term_start date,
  ADD COLUMN IF NOT EXISTS role_term_end date;

-- Department position term. A dept_lead membership whose term has ended keeps
-- its row (history intact) but stops conferring dept_lead authority.
ALTER TABLE public.department_memberships
  ADD COLUMN IF NOT EXISTS term_start date,
  ADD COLUMN IF NOT EXISTS term_end date;

-- Sponsorships carry a vertical so a vertical lead's finance view can be
-- scoped exactly like budget heads and expenses. NULL = society-wide.
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS vertical text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sponsorships_vertical_check'
      AND conrelid = 'public.sponsorships'::regclass
  ) THEN
    ALTER TABLE public.sponsorships
      ADD CONSTRAINT sponsorships_vertical_check
      CHECK (vertical IS NULL OR vertical IN ('technical', 'non_technical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sponsorships_tenant_vertical_idx
  ON public.sponsorships(tenant_id, vertical);

-- One row per appointment. Current position columns stay authoritative for
-- authorization; this table answers "who held what, when, and under whom".
CREATE TABLE IF NOT EXISTS public.leadership_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL,
  vertical text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  status text NOT NULL DEFAULT 'active',
  appointed_by text,
  ended_reason text,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leadership_terms_role_check CHECK (
    role IN ('core', 'dept_lead', 'vertical_lead', 'admin')
  ),
  CONSTRAINT leadership_terms_vertical_check CHECK (
    vertical IS NULL OR vertical IN ('technical', 'non_technical')
  ),
  CONSTRAINT leadership_terms_status_check CHECK (
    status IN ('active', 'ended', 'expired')
  ),
  CONSTRAINT leadership_terms_dates_check CHECK (
    ends_on IS NULL OR ends_on >= starts_on
  )
);
CREATE INDEX IF NOT EXISTS leadership_terms_tenant_idx
  ON public.leadership_terms(tenant_id, status, ends_on);
CREATE INDEX IF NOT EXISTS leadership_terms_user_idx
  ON public.leadership_terms(tenant_id, user_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS leadership_terms_department_idx
  ON public.leadership_terms(tenant_id, department_id, status);

-- Stronger guard for the annual rotation job: at most one active appointment
-- per person + scope. Scoped to non-null ends_on so historical rows never
-- collide. Partial indexes are supported by the pooler path (plain Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS leadership_terms_active_user_role_idx
  ON public.leadership_terms(tenant_id, user_id, role)
  WHERE status = 'active' AND role <> 'dept_lead';
CREATE UNIQUE INDEX IF NOT EXISTS leadership_terms_active_dept_idx
  ON public.leadership_terms(tenant_id, user_id, department_id)
  WHERE status = 'active' AND department_id IS NOT NULL;

-- Fail-closed RLS, mirroring 031/040/041/042. NULL tenant_id is not a
-- legitimate state for an appointment, so there is no "allow unset" arm.
DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY['leadership_terms'];
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

-- Mirror 026's role hardening for the new table. Default privileges from 030
-- already cover loom_app when migrations run as the owner; these revokes keep
-- anon/authenticated out even if the table is created by another role.
DO $$
BEGIN
  BEGIN EXECUTE 'REVOKE ALL ON TABLE public.leadership_terms FROM PUBLIC'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'REVOKE ALL ON TABLE public.leadership_terms FROM anon'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'REVOKE ALL ON TABLE public.leadership_terms FROM authenticated'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

COMMENT ON COLUMN public.platform_admins.is_founder IS
  'Founder seat: permanent platform admin. Role-change APIs must not demote.';
COMMENT ON COLUMN public.platform_admins.locked IS
  'When true, role-change APIs refuse to modify this account.';
COMMENT ON COLUMN public.profiles.role_term_end IS
  'End of the current global role term. NULL = grandfathered / no expiry.';
COMMENT ON COLUMN public.department_memberships.term_end IS
  'End of the department position term. Expired dept_lead rows keep history but lose authority.';
COMMENT ON TABLE public.leadership_terms IS
  'Append-only appointment history for annual leadership rotation.';
