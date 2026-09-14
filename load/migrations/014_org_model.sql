-- 014_org_model: the society's org chart, made concrete.
--
-- Implements the Website Plan's 5 access levels (Super Admin / Vertical Lead /
-- Department Head+Co-Head / Core / General) as data, not gates:
--   - departments: one row per tech/non-tech department per tenant. Head and
--     Co-Head share a single permission tier (docx section 7), so no separate
--     role values — leadership is recorded here, capability in memberships.
--   - department_memberships: level general|core|dept_lead. Joining as General
--     is instant and approval-free; Core is granted by a dept_lead; dept_lead
--     is assigned by an admin (Vertical Lead owns their vertical only).
--   - profiles gains vertical (technical|non_technical, for Vertical Leads)
--     plus roll_number/branch for the approval-free signup form (plan section 6).
-- Role values live in profiles.role as free text (codebase convention, no
-- CHECK): student | core | dept_lead | vertical_lead | admin. The mentor→core
-- backfill ships with the permissions module (commit 2) so no interim state
-- strands users between the old hierarchy and the new one.
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  vertical text NOT NULL DEFAULT 'technical',
  description text NOT NULL DEFAULT '',
  head_user_id text,
  co_head_user_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_vertical_check CHECK (vertical IN ('technical', 'non_technical')),
  CONSTRAINT departments_slug_unique UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS departments_tenant_idx
  ON public.departments(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.department_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'general',
  core_requested boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dept_memberships_level_check CHECK (level IN ('general', 'core', 'dept_lead')),
  CONSTRAINT dept_memberships_one_row UNIQUE (user_id, department_id)
);
CREATE INDEX IF NOT EXISTS dept_memberships_dept_idx
  ON public.department_memberships(department_id, level);
CREATE INDEX IF NOT EXISTS dept_memberships_user_idx
  ON public.department_memberships(user_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vertical text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roll_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch text;
