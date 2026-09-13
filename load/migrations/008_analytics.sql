-- 008_analytics: insights snapshots, cohort health, node bottlenecks, mentor effectiveness
-- Tracked migration. Apply with: node load/migrate.js

-- Per-student daily rollup (written by load/rollup-analytics.js).
CREATE TABLE IF NOT EXISTS public.student_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  total_commits integer NOT NULL DEFAULT 0,
  total_prs integer NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  roadmap_completion_pct numeric NOT NULL DEFAULT 0,
  oss_verified integer NOT NULL DEFAULT 0,
  achievements integer NOT NULL DEFAULT 0,
  consistency_score numeric NOT NULL DEFAULT 0,
  active_days_30 integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS analytics_snap_student_idx ON public.student_analytics_snapshots(student_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS analytics_snap_tenant_idx ON public.student_analytics_snapshots(tenant_id, snapshot_date DESC);

-- Per-chapter daily cohort health.
CREATE TABLE IF NOT EXISTS public.cohort_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  cohort_date date NOT NULL DEFAULT CURRENT_DATE,
  total_students integer NOT NULL DEFAULT 0,
  active_students_7d integer NOT NULL DEFAULT 0,
  avg_consistency numeric NOT NULL DEFAULT 0,
  avg_roadmap_pct numeric NOT NULL DEFAULT 0,
  domain_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, cohort_date)
);

-- Roadmap node funnel per tenant (started vs completed).
CREATE TABLE IF NOT EXISTS public.roadmap_node_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  total_started integer NOT NULL DEFAULT 0,
  total_completed integer NOT NULL DEFAULT 0,
  drop_off_pct numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE(node_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS node_analytics_tenant_idx ON public.roadmap_node_analytics(tenant_id);

-- Mentor outcomes per tenant.
CREATE TABLE IF NOT EXISTS public.mentor_effectiveness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  mentee_count integer NOT NULL DEFAULT 0,
  session_count integer NOT NULL DEFAULT 0,
  avg_mentee_roadmap_pct numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mentor_id, tenant_id)
);
