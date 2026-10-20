-- 051_oss_personalization: make the open-source catalogue matchable, keep
-- GitHub repository metadata, and give certificates a real signature.
--
-- Additive and idempotent. Every column is nullable/defaulted so existing rows
-- behave exactly as before until the backfill/sync scripts run.

-- ---------------------------------------------------------------------------
-- 1. Student contribution experience
-- ---------------------------------------------------------------------------
-- Nullable: an unset value means "infer from year + roadmap progress" rather
-- than guessing and persisting a guess.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS oss_level text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_oss_level_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_oss_level_check
      CHECK (oss_level IS NULL OR oss_level IN ('beginner', 'intermediate', 'advanced'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Open-source catalogue metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.open_source_projects
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS contributing_url text,
  ADD COLUMN IF NOT EXISTS homepage text,
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS oss_projects_level_domain_idx
  ON public.open_source_projects(difficulty, primary_domain);
CREATE INDEX IF NOT EXISTS oss_projects_language_idx
  ON public.open_source_projects(language);
CREATE INDEX IF NOT EXISTS oss_projects_active_idx
  ON public.open_source_projects(is_active) WHERE is_active;

-- ---------------------------------------------------------------------------
-- 3. GitHub repositories the student can push to
-- ---------------------------------------------------------------------------
-- This table used to hold only seed rows (id/owner/name/full_name/student_id).
-- Give it the metadata a picker needs and a tenant so reads stay scoped.
ALTER TABLE public.repositories
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS github_id bigint,
  ADD COLUMN IF NOT EXISTS html_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS stars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_issues integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fork boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_branch text,
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS repositories_student_full_name_key
  ON public.repositories(student_id, lower(full_name));
CREATE INDEX IF NOT EXISTS repositories_tenant_idx
  ON public.repositories(tenant_id);
CREATE INDEX IF NOT EXISTS repositories_pushed_idx
  ON public.repositories(pushed_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 4. Canonical contribution URLs
-- ---------------------------------------------------------------------------
-- GitHub treats /pull/12, /pull/12/, /pull/12/files and #issuecomment variants
-- as the same contribution. Storing the raw paste allowed duplicate verified
-- rows -- and therefore inflated badges.
ALTER TABLE public.student_oss_contributions
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS review_note text;

UPDATE public.student_oss_contributions
SET canonical_url = lower(regexp_replace(pr_url, '/+$', ''))
WHERE canonical_url IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS oss_contrib_canonical_key
  ON public.student_oss_contributions(student_id, canonical_url)
  WHERE canonical_url IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Certificate authenticity
-- ---------------------------------------------------------------------------
-- A verification code proves the row exists, not that LOOM issued it. Sign the
-- immutable fields so a row edited directly in the database cannot masquerade
-- as a valid certificate.
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS certificates_code_key
  ON public.certificates(verification_code);
