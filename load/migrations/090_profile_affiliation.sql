-- 090_profile_affiliation: record where a member studies, and let a chapter say
-- which institution it serves.
--
-- WHY THIS EXISTS
-- Onboarding asked for name, branch, enrollment number, year and a track. It
-- never asked which college the member attends, so the only thing that decided
-- their chapter was the host they happened to sign up on: a shared deployment
-- put every single signup into DEFAULT_TENANT_SLUG. Someone from a different
-- campus had no way to say so, and no operator had a column to filter on.
--
-- This migration adds the missing facts. It deliberately does NOT move anybody:
-- a profile's chapter is an isolation boundary, and re-homing accounts is a
-- governance decision, not a side effect of a schema change.
--
-- Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. What the member told us
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institution text,
  ADD COLUMN IF NOT EXISTS location text;

-- ---------------------------------------------------------------------------
-- 2. What the chapter is
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS institution text,
  ADD COLUMN IF NOT EXISTS city text;

-- A chapter can be known by more than one spelling ("IIT Delhi", "Indian
-- Institute of Technology Delhi", "IITD"). One row per alias, so matching never
-- depends on an operator typing the name the same way a student will.
CREATE TABLE IF NOT EXISTS public.tenant_institutions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- The same alias cannot be claimed twice by one chapter (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS tenant_institutions_name_unique
  ON public.tenant_institutions (tenant_id, lower(name));

-- The lookup that matters: "which chapter serves this institution?" is a scan
-- over every alias on every onboarding save, so index the compared expression.
CREATE INDEX IF NOT EXISTS tenant_institutions_lookup_idx
  ON public.tenant_institutions (lower(btrim(name)));

-- Backfill: a chapter's own name is its institution until an operator says
-- otherwise. NULL-only, so an edited value survives a re-run.
UPDATE public.tenants
   SET institution = name
 WHERE institution IS NULL;

INSERT INTO public.tenant_institutions (tenant_id, name)
SELECT id, btrim(institution)
  FROM public.tenants
 WHERE institution IS NOT NULL
   AND btrim(institution) <> ''
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Repair memberships written without a chapter
-- ---------------------------------------------------------------------------
-- 065 added department_memberships.tenant_id and backfilled it once, but every
-- writer kept inserting without the column, so each membership created since
-- landed with tenant_id NULL. Those rows are invisible to any tenant-scoped
-- read (including /lead/departments). The writers are fixed in the same change;
-- this repairs the rows already written. NULL-only.
UPDATE public.department_memberships dm
   SET tenant_id = d.tenant_id
  FROM public.departments d
 WHERE dm.department_id = d.id
   AND dm.tenant_id IS NULL;
