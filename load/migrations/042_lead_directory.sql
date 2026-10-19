-- 042_lead_directory: the chapter's own leadership directory.
--
-- This is an internal roster of who leads what — department leads, vertical
-- leads, coordinators — including past tenure holders who still need to be
-- reachable for handover. It is deliberately separate from `profiles`:
-- a row can outlive a member's account (alumni, external faculty advisor) and
-- a member can hold several titles over time.
--
-- user_id links a row to a live account when there is one, so the directory can
-- show "current role" from profiles while keeping a handwritten record for
-- people without accounts. It is nullable on purpose and never required.
--
-- Additive and idempotent (AGENTS.md iron rule 6). Fail-closed RLS in the same
-- style and order as migrations 031/040/041.

CREATE TABLE IF NOT EXISTS public.lead_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  name text NOT NULL,
  title text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  vertical text,
  email text,
  linkedin_url text,
  bio text NOT NULL DEFAULT '',
  tenure_start date,
  tenure_end date,
  is_current boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_directory_vertical_check CHECK (vertical IS NULL OR vertical IN ('technical', 'non_technical')),
  CONSTRAINT lead_directory_tenure_check CHECK (tenure_end IS NULL OR tenure_start IS NULL OR tenure_end >= tenure_start)
);
CREATE INDEX IF NOT EXISTS lead_directory_tenant_idx
  ON public.lead_directory(tenant_id, is_active, is_current, sort_order);
CREATE INDEX IF NOT EXISTS lead_directory_department_idx
  ON public.lead_directory(tenant_id, department_id);
CREATE INDEX IF NOT EXISTS lead_directory_user_idx
  ON public.lead_directory(tenant_id, user_id);

-- Fail-closed RLS, mirroring migrations 031/040/041. NULL tenant_id is never a
-- legitimate state here, so there is no "allow unset" arm.
DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY['lead_directory'];
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
