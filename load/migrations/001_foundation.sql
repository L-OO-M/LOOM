-- 001_foundation: tenant membership + growth/ecosystem tables
-- Tracked migration. Apply with: node load/migrate.js

-- profiles: tenant scope + onboarding + github identity
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_username text;
CREATE INDEX IF NOT EXISTS profiles_tenant_id_idx ON public.profiles(tenant_id);

-- users mirror: tenant scope
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON public.users(tenant_id);

-- student_roadmap_progress: proper upsert key (existing route used ON CONFLICT(id) which never fires)
CREATE UNIQUE INDEX IF NOT EXISTS student_roadmap_progress_student_node_unique
  ON public.student_roadmap_progress(student_id, node_id);
CREATE INDEX IF NOT EXISTS student_roadmap_progress_student_idx ON public.student_roadmap_progress(student_id);

-- resource progress
CREATE TABLE IF NOT EXISTS public.resource_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  resource_id text NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'completed',
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, resource_id)
);
CREATE INDEX IF NOT EXISTS resource_progress_student_idx ON public.resource_progress(student_id);

-- projects (student-built, optionally linked to a roadmap node)
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  owner_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  roadmap_node_id text REFERENCES public.roadmap_nodes(id),
  status text NOT NULL DEFAULT 'active',
  repo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_tenant_idx ON public.projects(tenant_id);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON public.projects(owner_id);

-- contest registrations + submissions
CREATE TABLE IF NOT EXISTS public.contest_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  status text NOT NULL DEFAULT 'registered',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contest_id, student_id)
);
CREATE INDEX IF NOT EXISTS contest_registrations_contest_idx ON public.contest_registrations(contest_id);

CREATE TABLE IF NOT EXISTS public.contest_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contest_submissions_contest_idx ON public.contest_submissions(contest_id);

-- contests: tenant scope + description
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS contests_tenant_idx ON public.contests(tenant_id);

-- mentors directory (mentor_sessions already exists)
CREATE TABLE IF NOT EXISTS public.mentors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  tenant_id uuid REFERENCES public.tenants(id),
  expertise text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mentors_tenant_idx ON public.mentors(tenant_id);

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  user_id text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);

-- github connections (OAuth/App identity per student; tokens live in secrets, never here)
CREATE TABLE IF NOT EXISTS public.github_connections (
  user_id text PRIMARY KEY,
  github_username text,
  connected_at timestamptz NOT NULL DEFAULT now()
);

-- backfill: assign legacy profiles/users to demo tenant
UPDATE public.profiles p
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'demo-college' LIMIT 1)
WHERE p.tenant_id IS NULL AND EXISTS (SELECT 1 FROM public.tenants WHERE slug = 'demo-college');
