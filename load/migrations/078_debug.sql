CREATE TABLE IF NOT EXISTS public.debug_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  domain text NOT NULL,
  difficulty text NOT NULL DEFAULT 'intermediate',
  repo_path text NOT NULL,
  brief text NOT NULL DEFAULT '',
  verification text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debug_challenges_slug_check CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
  CONSTRAINT debug_challenges_title_check CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT debug_challenges_domain_check CHECK (
    domain IN ('ai_ml', 'web', 'cybersecurity', 'dsa', 'blockchain', 'embedded')
  ),
  CONSTRAINT debug_challenges_difficulty_check CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  CONSTRAINT debug_challenges_repo_path_check CHECK (repo_path ~ '^domains/[a-z0-9-]+/[a-z0-9-]+$'),
  CONSTRAINT debug_challenges_brief_check CHECK (char_length(brief) <= 5000),
  CONSTRAINT debug_challenges_verification_check CHECK (char_length(verification) <= 5000),
  UNIQUE (tenant_id, slug)
);
ALTER TABLE public.debug_challenges
  DROP CONSTRAINT IF EXISTS debug_challenges_domain_check;
ALTER TABLE public.debug_challenges
  ADD CONSTRAINT debug_challenges_domain_check CHECK (
    domain IN ('ai_ml', 'web', 'cybersecurity', 'dsa', 'blockchain', 'embedded')
  );

CREATE INDEX IF NOT EXISTS debug_challenges_tenant_domain_idx
  ON public.debug_challenges(tenant_id, domain, is_published);

CREATE TABLE IF NOT EXISTS public.debug_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.debug_challenges(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  fork_url text NOT NULL,
  fork_full_name text,
  fork_repo_id bigint,
  fork_owner text,
  pr_url text,
  verification_status text NOT NULL DEFAULT 'pending',
  verification_reason text,
  last_checked_at timestamptz,
  review_status text NOT NULL DEFAULT 'submitted',
  review_feedback text NOT NULL DEFAULT '',
  reviewed_by text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debug_submissions_fork_url_check CHECK (fork_url ~ '^https://github\.com/'),
  CONSTRAINT debug_submissions_pr_url_check CHECK (pr_url IS NULL OR pr_url ~ '^https://github\.com/'),
  CONSTRAINT debug_submissions_verification_check CHECK (verification_status IN ('pending', 'verified', 'rejected', 'error')),
  CONSTRAINT debug_submissions_review_check CHECK (review_status IN ('submitted', 'approved', 'rejected')),
  CONSTRAINT debug_submissions_approved_check CHECK (review_status <> 'approved' OR verification_status = 'verified'),
  CONSTRAINT debug_submissions_feedback_check CHECK (char_length(review_feedback) <= 2000),
  CONSTRAINT debug_submissions_reason_check CHECK (verification_reason IS NULL OR char_length(verification_reason) <= 500),
  UNIQUE (tenant_id, user_id, challenge_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS debug_submissions_fork_repo_idx
  ON public.debug_submissions(tenant_id, fork_repo_id)
  WHERE fork_repo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS debug_submissions_queue_idx
  ON public.debug_submissions(tenant_id, review_status, verification_status, created_at);
CREATE INDEX IF NOT EXISTS debug_submissions_user_idx
  ON public.debug_submissions(tenant_id, user_id, created_at DESC);

-- Debug evidence must be independently applicable: migrations 076-077 are not
-- assumed to have run. If additional ranking kinds land later, merge them into
-- this list rather than letting a later migration drop them.
ALTER TABLE public.ranking_events DROP CONSTRAINT IF EXISTS ranking_events_kind_check;
ALTER TABLE public.ranking_events ADD CONSTRAINT ranking_events_kind_check
  CHECK (kind IN (
    'roadmap_done',
    'resource_done',
    'project_verified',
    'oss_verified',
    'contest_top',
    'event_attended',
    'solution_accepted',
    'debug_fixed'
  ));

CREATE OR REPLACE FUNCTION public.ranking_kind_cap(kind text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE kind
    WHEN 'event_attended' THEN 20
    WHEN 'solution_accepted' THEN 15
    WHEN 'roadmap_done' THEN 40
    WHEN 'project_verified' THEN 10
    WHEN 'oss_verified' THEN 15
    WHEN 'contest_top' THEN 5
    WHEN 'debug_fixed' THEN 10
    ELSE 0
  END
$$;

CREATE OR REPLACE FUNCTION public.recompute_ranking_scores(p_tenant_id uuid) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  cnt int := 0;
BEGIN
  WITH verified AS (
    SELECT re.user_id,
           re.kind,
           re.ref_id,
           re.created_at,
           re.weight,
           ROW_NUMBER() OVER (PARTITION BY re.user_id, re.kind ORDER BY re.created_at ASC, re.ref_id ASC) AS seq
      FROM public.ranking_events re
     WHERE re.tenant_id = p_tenant_id
       AND re.verified_by IS NOT NULL
  ),
  capped AS (
    SELECT v.user_id,
           v.kind,
           v.ref_id,
           public.ranking_decayed_weight(v.weight, v.created_at) * (
             CASE WHEN v.seq <= public.ranking_kind_cap(v.kind) THEN 1.0 ELSE 0.0 END
           )::int AS contribution
      FROM verified v
  ),
  per_user AS (
    SELECT c.user_id,
           COALESCE(SUM(c.contribution), 0)::int AS score,
           COUNT(*) FILTER (WHERE c.kind = 'roadmap_done') AS roadmap_done,
           COUNT(*) FILTER (WHERE c.kind = 'project_verified') AS project_verified,
           COUNT(*) FILTER (WHERE c.kind = 'oss_verified') AS oss_verified,
           COUNT(*) FILTER (WHERE c.kind = 'contest_top') AS contest_top,
           COUNT(*) FILTER (WHERE c.kind = 'solution_accepted') AS solution_accepted,
           COUNT(*) FILTER (WHERE c.kind = 'event_attended') AS event_attended,
           COUNT(*) FILTER (WHERE c.kind = 'debug_fixed') AS debug_fixed
      FROM capped c
     GROUP BY c.user_id
  )
  INSERT INTO public.ranking_scores (user_id, tenant_id, score, tier, evidence, updated_at)
  SELECT p.user_id,
         p_tenant_id,
         p.score,
         CASE
           WHEN p.score >= 400 THEN 'advanced'
           WHEN p.score >= 120 THEN 'intermediate'
           ELSE 'beginner'
         END,
         jsonb_build_object(
           'roadmap_done', p.roadmap_done,
           'project_verified', p.project_verified,
           'oss_verified', p.oss_verified,
           'contest_top', p.contest_top,
           'solution_accepted', p.solution_accepted,
           'event_attended', p.event_attended,
           'debug_fixed', p.debug_fixed
         ),
         now()
    FROM per_user p
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    score = EXCLUDED.score,
    tier = EXCLUDED.tier,
    evidence = EXCLUDED.evidence,
    updated_at = now();

  GET DIAGNOSTICS cnt = ROW_COUNT;

  DELETE FROM public.ranking_scores rs
   WHERE rs.tenant_id = p_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM public.ranking_events re
        WHERE re.tenant_id = rs.tenant_id
          AND re.user_id = rs.user_id
          AND re.verified_by IS NOT NULL
     );

  RETURN cnt;
END $$;

DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY['debug_challenges', 'debug_submissions'];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON public.%I AS PERMISSIVE
         FOR ALL
         USING (tenant_id::text = current_setting(''app.tenant_id'', true))
         WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t);
  END LOOP;
END $$;
