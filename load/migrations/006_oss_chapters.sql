-- 006_oss_chapters: Open Source contribution portal + cross-college chapter federation
-- Tracked migration. Apply with: node load/migrate.js
-- All objects idempotent (IF NOT EXISTS / DO blocks safe to re-run).

-- Curated OSS projects: global (tenant_id NULL = visible to every college)
-- or college-sponsored (tenant_id set = curated for that chapter).
CREATE TABLE IF NOT EXISTS public.open_source_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  github_repo_url text NOT NULL,
  owner text NOT NULL,
  repo_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  primary_domain text NOT NULL DEFAULT 'web',
  language text,
  stars integer NOT NULL DEFAULT 0,
  good_first_issues integer NOT NULL DEFAULT 0,
  is_curated boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(github_repo_url)
);
CREATE INDEX IF NOT EXISTS oss_projects_tenant_idx ON public.open_source_projects(tenant_id);
CREATE INDEX IF NOT EXISTS oss_projects_domain_idx ON public.open_source_projects(primary_domain);
CREATE INDEX IF NOT EXISTS oss_projects_curated_idx ON public.open_source_projects(is_curated) WHERE is_curated;

-- Student OSS contributions: PRs/issues/reviews against tracked repos.
-- Rows are student-claimed first (status 'claimed'), then webhook-verified
-- (status 'verified', verified_at set) when the merge event arrives.
CREATE TABLE IF NOT EXISTS public.student_oss_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.open_source_projects(id) ON DELETE SET NULL,
  repo_url text NOT NULL,
  pr_url text NOT NULL,
  pr_number integer,
  title text NOT NULL DEFAULT '',
  contribution_type text NOT NULL DEFAULT 'pr' CHECK (contribution_type IN ('pr', 'issue', 'review', 'commit')),
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'verified', 'rejected')),
  merged_at timestamptz,
  files_changed integer NOT NULL DEFAULT 0,
  lines_added integer NOT NULL DEFAULT 0,
  lines_deleted integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, pr_url)
);
CREATE INDEX IF NOT EXISTS oss_contrib_student_idx ON public.student_oss_contributions(student_id);
CREATE INDEX IF NOT EXISTS oss_contrib_project_idx ON public.student_oss_contributions(project_id);
CREATE INDEX IF NOT EXISTS oss_contrib_status_idx ON public.student_oss_contributions(status);

-- Earned OSS badges (first-pr, five-merged, reviewer, docs-pro).
CREATE TABLE IF NOT EXISTS public.oss_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  project_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(student_id, badge_key)
);
CREATE INDEX IF NOT EXISTS oss_badges_student_idx ON public.oss_badges(student_id);

-- Public chapter profile per tenant (opt-in public page + federation stats).
CREATE TABLE IF NOT EXISTS public.chapter_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  public_name text NOT NULL,
  mission text NOT NULL DEFAULT '',
  contact_email text,
  website_url text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_featured boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chapter_profiles_public_idx ON public.chapter_profiles(is_public) WHERE is_public;

-- Chapter partnerships (resource-share, joint-contests, mentor-exchange).
CREATE TABLE IF NOT EXISTS public.chapter_partnerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_a_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_b_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  collaboration_type text NOT NULL DEFAULT 'resource-share',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tenant_a_id <> tenant_b_id),
  UNIQUE(tenant_a_id, tenant_b_id, collaboration_type)
);

-- Daily federation rollup (written by a scheduled job; read by /network + landing).
CREATE TABLE IF NOT EXISTS public.federation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL DEFAULT CURRENT_DATE,
  total_students integer NOT NULL DEFAULT 0,
  total_chapters integer NOT NULL DEFAULT 0,
  total_oss_contributions integer NOT NULL DEFAULT 0,
  top_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  per_tenant jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(metric_date)
);

-- Performance indexes on hot existing paths (Phase 4.5 quick win, safe to ship now).
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leaderboard_scope_period_idx ON public.leaderboard_snapshots(scope, period);
CREATE INDEX IF NOT EXISTS daily_activity_student_day_idx ON public.student_daily_activity(student_id, day DESC);
CREATE INDEX IF NOT EXISTS github_events_actor_idx ON public.github_events(actor_login);
