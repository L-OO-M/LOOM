-- 027_ranking_evidence: evidence-based ranking (weights + 90d decay) + materialized scores
-- Tenant-isolated via RLS (policy on tenant_id). All scores derived from ranking_events only.

CREATE TABLE IF NOT EXISTS public.ranking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('roadmap_done','resource_done','project_verified','oss_verified','contest_top','event_attended','solution_accepted')),
  ref_id text NOT NULL,
  weight smallint NOT NULL CHECK (weight > 0),
  verified_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, kind, ref_id, user_id)
);
CREATE INDEX IF NOT EXISTS ranking_events_user_idx ON public.ranking_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ranking_events_tenant_score_idx ON public.ranking_events(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS public.ranking_scores (
  user_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'beginner' CHECK (tier IN ('beginner','intermediate','advanced')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ranking_scores_tenant_score_idx ON public.ranking_scores(tenant_id, score DESC, updated_at DESC);

-- Helper: decayed score (90d 0.7x)
CREATE OR REPLACE FUNCTION public.ranking_decayed_weight(weight int, created_at timestamptz) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN created_at < now() - interval '90 days' THEN (weight * 0.7)::int ELSE weight END
$$;

-- Recompute scores for a tenant (called via pg_cron or app)
CREATE OR REPLACE FUNCTION public.recompute_ranking_scores(p_tenant_id uuid) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  cnt int := 0;
BEGIN
  INSERT INTO public.ranking_scores (user_id, tenant_id, score, tier, evidence, updated_at)
  SELECT
    re.user_id,
    p_tenant_id,
    COALESCE(SUM(public.ranking_decayed_weight(re.weight, re.created_at)),0)::int AS score,
    CASE
      WHEN COALESCE(SUM(public.ranking_decayed_weight(re.weight, re.created_at)),0) >= 60 THEN 'advanced'
      WHEN COALESCE(SUM(public.ranking_decayed_weight(re.weight, re.created_at)),0) >= 18 THEN 'intermediate'
      ELSE 'beginner'
    END AS tier,
    jsonb_build_object(
      'roadmap_done', COUNT(*) FILTER (WHERE re.kind='roadmap_done'),
      'resource_done', COUNT(*) FILTER (WHERE re.kind='resource_done'),
      'project_verified', COUNT(*) FILTER (WHERE re.kind='project_verified'),
      'oss_verified', COUNT(*) FILTER (WHERE re.kind='oss_verified'),
      'contest_top', COUNT(*) FILTER (WHERE re.kind='contest_top'),
      'solution_accepted', COUNT(*) FILTER (WHERE re.kind='solution_accepted'),
      'event_attended', COUNT(*) FILTER (WHERE re.kind='event_attended')
    ) AS evidence,
    now()
  FROM public.ranking_events re
  WHERE re.tenant_id = p_tenant_id
  GROUP BY re.user_id
  ON CONFLICT (user_id) DO UPDATE SET
    score = EXCLUDED.score,
    tier = EXCLUDED.tier,
    evidence = EXCLUDED.evidence,
    updated_at = now();

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END $$;

-- RLS
ALTER TABLE public.ranking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.ranking_events;
CREATE POLICY tenant_isolation_policy ON public.ranking_events FOR ALL
  USING (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE public.ranking_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_scores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.ranking_scores;
CREATE POLICY tenant_isolation_policy ON public.ranking_scores FOR ALL
  USING (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true));

COMMENT ON TABLE public.ranking_events IS '027 evidence per kind, unique per ref_id prevents gaming';
COMMENT ON TABLE public.ranking_scores IS '027 materialized tenant leaderboard, recomputed via recompute_ranking_scores()';
