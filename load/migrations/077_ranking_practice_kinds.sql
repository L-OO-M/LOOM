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
    'dsa_solved',
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
    WHEN 'dsa_solved' THEN 20
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
           COUNT(*) FILTER (WHERE c.kind = 'dsa_solved') AS dsa_solved,
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
           'dsa_solved', p.dsa_solved,
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
