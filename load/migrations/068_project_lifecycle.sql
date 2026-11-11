-- 068_project_lifecycle: team, milestones, and a review trail for projects.
--
-- A project used to be a single row an owner could edit. That is enough for a
-- personal bookmark and not enough for the thing #41 asks for: collaborators,
-- a visible plan, a deliberate submit-for-review step, and a credential that
-- points back at the verified work. The tables below are additive; every write
-- still carries tenant_id and every read is scoped by it.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS review_note text;

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('maintainer', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_tenant_idx ON public.project_members(tenant_id);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS project_members_project_idx ON public.project_members(project_id);

CREATE TABLE IF NOT EXISTS public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'done')),
  position integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, position)
);
CREATE INDEX IF NOT EXISTS project_milestones_tenant_idx ON public.project_milestones(tenant_id);
CREATE INDEX IF NOT EXISTS project_milestones_project_idx ON public.project_milestones(project_id);

-- A verified project becomes an achievement the student can turn into a signed
-- credential. The existing check only allowed manual/oss/contest/roadmap.
ALTER TABLE public.student_achievements
  DROP CONSTRAINT IF EXISTS student_achievements_source_type_check;
ALTER TABLE public.student_achievements
  ADD CONSTRAINT student_achievements_source_type_check
  CHECK (source_type IN ('manual', 'oss', 'contest', 'roadmap', 'project'));
