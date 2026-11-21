-- 095_ed25519_and_evidence_categories.sql
-- Categorized ranking events, asymmetric keyrings for credentials, and passport visibility levels.

-- ---------------------------------------------------------------------------
-- 1. Asymmetric Keyring for Verifiable Credentials (Ed25519)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_keyrings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_id text NOT NULL UNIQUE,
  algorithm text NOT NULL DEFAULT 'Ed25519',
  public_key_pem text NOT NULL,
  private_key_pem_encrypted text, -- Encrypted at rest via APP_SECRET / KMS
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT tenant_keyrings_algorithm_check CHECK (algorithm IN ('Ed25519', 'HMAC-SHA256'))
);

CREATE INDEX IF NOT EXISTS tenant_keyrings_lookup_idx
  ON public.tenant_keyrings(tenant_id, is_active, algorithm)
  WHERE is_active = true AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Enhanced Ranking Events Categorization and Deduplication
-- ---------------------------------------------------------------------------
ALTER TABLE public.ranking_events
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'legacy_unclassified',
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dedupe_hash text;

-- Classify historical evidence accurately based on existing kinds
UPDATE public.ranking_events
SET category = CASE
  WHEN kind IN ('roadmap_done', 'resource_done', 'dsa_solved') THEN 'learning'
  WHEN kind IN ('project_verified', 'oss_verified', 'debug_fixed', 'contest_top') THEN 'technical'
  WHEN kind IN ('event_attended') THEN 'event_participation'
  WHEN kind IN ('solution_accepted') THEN 'community'
  WHEN kind IN ('dept_work', 'deliverable') THEN 'department_work'
  ELSE 'legacy_unclassified'
END
WHERE category = 'legacy_unclassified';

ALTER TABLE public.ranking_events DROP CONSTRAINT IF EXISTS ranking_events_category_check;
ALTER TABLE public.ranking_events ADD CONSTRAINT ranking_events_category_check CHECK (
  category IN (
    'technical',
    'department_work',
    'event_participation',
    'community',
    'leadership',
    'learning',
    'legacy_unclassified'
  )
);

ALTER TABLE public.ranking_events DROP CONSTRAINT IF EXISTS ranking_events_points_check;
ALTER TABLE public.ranking_events ADD CONSTRAINT ranking_events_points_check CHECK (points >= 0);

-- Unique constraint on dedupe_hash where present (avoids breaking historical rows)
CREATE UNIQUE INDEX IF NOT EXISTS ranking_events_dedupe_hash_idx
  ON public.ranking_events(tenant_id, dedupe_hash)
  WHERE dedupe_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Profile Privacy Settings for Public Developer Passports
-- ---------------------------------------------------------------------------
-- Uses visibility levels ('private', 'chapter', 'public', 'hidden')
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS passport_privacy jsonb NOT NULL DEFAULT '{
    "visibility": "chapter",
    "show_roll_number": "private",
    "show_branch": "chapter",
    "show_year": "chapter",
    "show_department_work": "chapter",
    "show_github_stats": "public",
    "show_certificates": "public"
  }'::jsonb;
