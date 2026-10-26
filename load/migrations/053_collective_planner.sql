-- 053_collective_planner: the LOOM 2026-27 collective master planner.
--
-- One shared society calendar across six technical wings. Curriculum sessions
-- (DSA, AI/ML, Cyber, Web, Hardware, Web3) live in `planner_sessions`; society
-- milestones stay in `events` and gain a small planner link so the calendar can
-- place them on the right week without duplicating the registration flow.
--
-- The 20 Nov - 20 Dec 2026 relaxation window is a first-class flag: sessions
-- whose date falls inside it are stored with delivery_mode = 'deferred' and
-- never render as live. The window itself is on `planner_weeks.is_relaxation`.
--
-- Additive and idempotent. Every column is nullable/defaulted so existing
-- events behave exactly as before.

-- ---------------------------------------------------------------------------
-- 1. Planner weeks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planner_weeks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid,
  academic_year text NOT NULL,
  week_number integer NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  theme text NOT NULL DEFAULT ''::text,
  delivery_mode text NOT NULL DEFAULT 'live'::text,
  is_protected boolean NOT NULL DEFAULT false,
  is_relaxation boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS planner_weeks_identity_key
  ON public.planner_weeks (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year, week_number);
CREATE INDEX IF NOT EXISTS planner_weeks_tenant_idx
  ON public.planner_weeks (tenant_id, academic_year, week_number);

-- ---------------------------------------------------------------------------
-- 2. Planner sessions (curriculum + coordination milestones)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planner_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid,
  academic_year text NOT NULL,
  week_number integer NOT NULL,
  track_domain text NOT NULL DEFAULT 'general'::text,
  curriculum_ref text,
  title text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  session_kind text NOT NULL DEFAULT 'workshop'::text,
  day_of_week integer,
  starts_time time,
  ends_time time,
  delivery_mode text NOT NULL DEFAULT 'live'::text,
  is_required boolean NOT NULL DEFAULT false,
  is_relaxation boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS planner_sessions_ref_key
  ON public.planner_sessions (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year, track_domain, curriculum_ref)
  WHERE curriculum_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS planner_sessions_week_idx
  ON public.planner_sessions (tenant_id, academic_year, week_number, sort_order);
CREATE INDEX IF NOT EXISTS planner_sessions_track_idx
  ON public.planner_sessions (tenant_id, academic_year, track_domain);

-- ---------------------------------------------------------------------------
-- 3. Planner link on society events
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS planner_year text,
  ADD COLUMN IF NOT EXISTS planner_week integer,
  ADD COLUMN IF NOT EXISTS planner_kind text,
  ADD COLUMN IF NOT EXISTS planner_ref text,
  ADD COLUMN IF NOT EXISTS planner_status text NOT NULL DEFAULT 'scheduled'::text;

CREATE UNIQUE INDEX IF NOT EXISTS events_planner_ref_key
  ON public.events (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), planner_ref)
  WHERE planner_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_planner_week_idx
  ON public.events (tenant_id, planner_year, planner_week);

-- ---------------------------------------------------------------------------
-- 4. Row level security: same tenant-only policy as the rest of the schema.
-- ---------------------------------------------------------------------------
ALTER TABLE public.planner_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_weeks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.planner_weeks;
CREATE POLICY tenant_isolation_policy ON public.planner_weeks AS PERMISSIVE TO public
  USING (
    (current_setting('app.tenant_id'::text, true) = ''::text)
    OR (current_setting('app.tenant_id'::text, true) IS NULL)
    OR ((tenant_id)::text = current_setting('app.tenant_id'::text, true))
  )
  WITH CHECK (
    (current_setting('app.tenant_id'::text, true) = ''::text)
    OR (current_setting('app.tenant_id'::text, true) IS NULL)
    OR ((tenant_id)::text = current_setting('app.tenant_id'::text, true))
  );

ALTER TABLE public.planner_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.planner_sessions;
CREATE POLICY tenant_isolation_policy ON public.planner_sessions AS PERMISSIVE TO public
  USING (
    (current_setting('app.tenant_id'::text, true) = ''::text)
    OR (current_setting('app.tenant_id'::text, true) IS NULL)
    OR ((tenant_id)::text = current_setting('app.tenant_id'::text, true))
  )
  WITH CHECK (
    (current_setting('app.tenant_id'::text, true) = ''::text)
    OR (current_setting('app.tenant_id'::text, true) IS NULL)
    OR ((tenant_id)::text = current_setting('app.tenant_id'::text, true))
  );
