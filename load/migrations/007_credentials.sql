-- 007_credentials: skill verification + portable verifiable credentials
-- Tracked migration. Apply with: node load/migrate.js

-- Per-chapter badge definitions (e.g. "DSA Contest Master", tier 1-3).
CREATE TABLE IF NOT EXISTS public.skill_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  tier integer NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skill_badges_tenant_idx ON public.skill_badges(tenant_id);

-- What a student earned: either a defined skill badge (badge_id) or an
-- auto-issued source achievement (source_type/source_ref, e.g. oss/first-pr).
CREATE TABLE IF NOT EXISTS public.student_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  badge_id uuid REFERENCES public.skill_badges(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'oss', 'contest', 'roadmap')),
  source_ref text,
  level text NOT NULL DEFAULT 'gold' CHECK (level IN ('bronze', 'silver', 'gold')),
  evidence_url text,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, badge_id, source_type, source_ref)
);
-- Source achievements carry badge_id NULL (NULLs never conflict in Postgres),
-- so they get their own partial uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS achievements_source_unique
  ON public.student_achievements(student_id, source_type, source_ref) WHERE badge_id IS NULL;
CREATE INDEX IF NOT EXISTS achievements_student_idx ON public.student_achievements(student_id);

-- Shareable signed credential links: /verify/credential/<id>
CREATE TABLE IF NOT EXISTS public.verifiable_credentials (
  id text PRIMARY KEY,
  student_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  achievement_id uuid REFERENCES public.student_achievements(id) ON DELETE CASCADE,
  credential_type text NOT NULL DEFAULT 'badge',
  title text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  signature text NOT NULL,
  view_count integer NOT NULL DEFAULT 0,
  last_verified_at timestamptz
);
CREATE INDEX IF NOT EXISTS credentials_student_idx ON public.verifiable_credentials(student_id);

CREATE TABLE IF NOT EXISTS public.credential_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id text NOT NULL REFERENCES public.verifiable_credentials(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credential_views_cred_idx ON public.credential_views(credential_id);
