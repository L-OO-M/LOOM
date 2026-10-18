-- 037_verified_evidence: make the evidence ledger the trust boundary for ranking.
--
-- WHY THIS EXISTS
--
-- Migration 027 built an evidence table with the right shape and then nothing
-- ever used it correctly. `verified_by` was declared nullable, no caller ever
-- passed it, and `recompute_ranking_scores` summed verified and unverified rows
-- identically. The only real protection was UNIQUE(tenant_id, kind, ref_id,
-- user_id), which stops one node being counted twice -- it does not stop the
-- node being counted at all.
--
-- Meanwhile the live leaderboard (lib/standings.js) never read this table. It
-- counted raw rows from `student_roadmap_progress` and `projects`, both of which
-- a student writes with a single unauthenticated-within-the-tenant POST. The
-- board therefore awarded 55 of every 100 points for self-declared rows: 30 per
-- roadmap node and 25 per project created. Both claims also minted real
-- student_achievements, which fed reputation and mentor eligibility, so a
-- forgery propagated well past the leaderboard.
--
-- This migration closes that at the database, not in the route handler. The
-- invariant it establishes:
--
--   A score exists only if some named actor -- a signed GitHub delivery, an
--   admin, or a system rule -- vouched for it. The student never vouches for
--   themselves.
--
-- Enforcement is a BEFORE INSERT trigger rather than a CHECK so it also holds
-- for the migration owner role and for any future writer. A CHECK would be
-- equally binding, but the trigger can name the rule in its error text, which
-- is what makes a failure diagnosable in audit_logs instead of a bare 500.
--
-- Idempotent throughout: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, and
-- guarded DDL blocks. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Provenance on the ledger
-- ---------------------------------------------------------------------------
-- `verified_by` already existed and was always NULL. Give the rest of the row
-- the same provenance so an event can be explained years later without
-- archaeology: who vouched, through what channel, and on what evidence.

ALTER TABLE public.ranking_events ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';
ALTER TABLE public.ranking_events ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.ranking_events ADD COLUMN IF NOT EXISTS verified_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ranking_events_source_check'
      AND conrelid = 'public.ranking_events'::regclass
  ) THEN
    ALTER TABLE public.ranking_events ADD CONSTRAINT ranking_events_source_check
      CHECK (source IN ('webhook', 'admin', 'system'));
  END IF;
END $$;

-- Two notes on the enum.
--
-- 'resource_done' stays (rows 027 already wrote it) but is no longer emitted
-- and no longer scores: it is a self-tick on a "did you watch this" checkbox,
-- which is not evidence of anything.
--
-- 'commit', 'pull_request' and 'review' are deliberately NOT kinds. They are
-- attested by the signed webhook delivery that produced them and already live,
-- one row per student per day, in student_daily_activity. Writing one ledger
-- row per commit would turn a 200-commit push into 200 inserts on the ingest
-- path for no additional trust. So the ledger holds only what needs a *vouched
-- actor* -- a webhook merge, an admin, or a system rule. Together with the
-- attested activity table that covers every point on the board, and nothing on
-- the board is self-declared.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ranking_events_kind_check'
      AND conrelid = 'public.ranking_events'::regclass
  ) THEN
    ALTER TABLE public.ranking_events DROP CONSTRAINT ranking_events_kind_check;
    ALTER TABLE public.ranking_events ADD CONSTRAINT ranking_events_kind_check
      CHECK (kind IN ('roadmap_done','resource_done','project_verified','oss_verified',
                      'contest_top','event_attended','solution_accepted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ranking_events_tenant_kind_idx
  ON public.ranking_events(tenant_id, kind, user_id);

-- ---------------------------------------------------------------------------
-- 2. The trigger: unverified evidence cannot enter the ledger
-- ---------------------------------------------------------------------------
-- This is the control the whole ranking redesign rests on. It fires for every
-- role including the owner role, so neither a bug in a route nor a manual
-- psql session can write an unvouched score.

CREATE OR REPLACE FUNCTION public.ranking_reject_unverified() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verified_by IS NULL OR btrim(NEW.verified_by) = '' THEN
    RAISE EXCEPTION
      'ranking_events.verified_by is required: a score may only be recorded when a webhook, an admin, or a system rule vouched for it (kind=%, ref_id=%)',
      NEW.kind, NEW.ref_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ranking_events_require_verification ON public.ranking_events;
CREATE TRIGGER ranking_events_require_verification
  BEFORE INSERT ON public.ranking_events
  FOR EACH ROW EXECUTE FUNCTION public.ranking_reject_unverified();

-- ---------------------------------------------------------------------------
-- 3. Fix the cross-tenant primary key on ranking_scores
-- ---------------------------------------------------------------------------
-- 027 declared `user_id text PRIMARY KEY` -- tenant_id was not part of the key.
-- recompute_ranking_scores then did ON CONFLICT (user_id) DO UPDATE without
-- refreshing tenant_id, so a user_id present in two chapters had one row
-- overwritten in place by the other chapter's recompute: a silent move of a
-- score across the tenant boundary. The fix is a composite key.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ranking_scores_pkey' AND conrelid = 'public.ranking_scores'::regclass
  ) THEN
    ALTER TABLE public.ranking_scores DROP CONSTRAINT ranking_scores_pkey;
    ALTER TABLE public.ranking_scores ADD CONSTRAINT ranking_scores_pkey
      PRIMARY KEY (tenant_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ranking_scores_user_idx
  ON public.ranking_scores(user_id);

-- ---------------------------------------------------------------------------
-- 4. Verified evidence columns on the two self-declared tables
-- ---------------------------------------------------------------------------
-- Both tables get the same three-state evidence lifecycle so the audit queue
-- can treat them identically:
--   provisional -> claimed, awaiting review or an automated signal (scores 0)
--   verified    -> vouched for; the only state that scores
--   rejected    -> refused; the claim is dead and its ledger rows are removed
--
-- Backfill is deliberately to 'provisional', NOT 'verified'. Every existing row
-- was written by the student, so none of it was ever vouched for. Backfilling to
-- 'verified' would launder exactly the rows this migration exists to distrust.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS repo_full_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS evidence_state text NOT NULL DEFAULT 'provisional';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS verified_by text;

UPDATE public.projects SET evidence_state = 'provisional' WHERE evidence_state IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_evidence_state_check'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_evidence_state_check
      CHECK (evidence_state IN ('provisional', 'verified', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
      CHECK (status IN ('active', 'completed', 'archived'));
  END IF;
END $$;

-- student_roadmap_progress already had `evidence_source`, declared in 000 and
-- never written by any code. Repurpose it rather than adding a near-duplicate
-- column, and name the value so it says who vouched.
ALTER TABLE public.student_roadmap_progress ADD COLUMN IF NOT EXISTS evidence_state text NOT NULL DEFAULT 'provisional';
ALTER TABLE public.student_roadmap_progress ADD COLUMN IF NOT EXISTS evidence_note text;
ALTER TABLE public.student_roadmap_progress ADD COLUMN IF NOT EXISTS evidence_url text;
ALTER TABLE public.student_roadmap_progress ADD COLUMN IF NOT EXISTS verified_by text;
ALTER TABLE public.student_roadmap_progress ADD COLUMN IF NOT EXISTS verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roadmap_progress_evidence_state_check'
      AND conrelid = 'public.student_roadmap_progress'::regclass
  ) THEN
    ALTER TABLE public.student_roadmap_progress ADD CONSTRAINT roadmap_progress_evidence_state_check
      CHECK (evidence_state IN ('provisional', 'verified', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roadmap_progress_status_check'
      AND conrelid = 'public.student_roadmap_progress'::regclass
  ) THEN
    ALTER TABLE public.student_roadmap_progress ADD CONSTRAINT roadmap_progress_status_check
      CHECK (status IN ('active', 'completed'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Attested repositories on github_events
-- ---------------------------------------------------------------------------
-- "Prove you actually worked in this repo" needs to be an indexed lookup, not a
-- scan over a jsonb payload. These columns are written by the webhook at ingest
-- time, from the already-attributed student_id, so the answer to "which repos
-- has this student got signed deliveries for?" is a single index scan.

ALTER TABLE public.github_events ADD COLUMN IF NOT EXISTS repository_name text;
ALTER TABLE public.github_events ADD COLUMN IF NOT EXISTS student_id text;
ALTER TABLE public.github_events ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.github_events ge
   SET repository_name = ge.payload->'repository'->>'full_name'
 WHERE ge.repository_name IS NULL
   AND ge.payload ? 'repository'
   AND ge.payload->'repository'->>'full_name' IS NOT NULL;

CREATE INDEX IF NOT EXISTS github_events_attested_repo_idx
  ON public.github_events(tenant_id, student_id, repository_name)
  WHERE repository_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS github_events_tenant_idx
  ON public.github_events(tenant_id);

-- ---------------------------------------------------------------------------
-- 6. Decay: correct volatility, and an actual curve
-- ---------------------------------------------------------------------------
-- 027 declared ranking_decayed_weight IMMUTABLE while it calls now(). An
-- IMMUTABLE function may be constant-folded and its result cached within a
-- plan, which is exactly wrong for a function whose value depends on the clock.
-- STABLE is the correct volatility.
--
-- It was also a single permanent step to 0.7x after 90 days, so "decay" meant
-- one discount that never aged further. This is a real two-step curve.

CREATE OR REPLACE FUNCTION public.ranking_decayed_weight(weight int, created_at timestamptz) RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN created_at < now() - interval '365 days' THEN GREATEST(1, (weight * 0.4)::int)
    WHEN created_at < now() - interval '180 days' THEN GREATEST(1, (weight * 0.6)::int)
    WHEN created_at < now() - interval '90 days'  THEN GREATEST(1, (weight * 0.8)::int)
    ELSE weight
  END
$$;

-- ---------------------------------------------------------------------------
-- 7. Per-kind caps: volume stops being a strategy
-- ---------------------------------------------------------------------------
-- Even fully verified, raw counts are the softest signal available -- a student
-- can push 200 trivial commits to an attested repo. So each kind pays full
-- weight up to a cap and NOTHING past it: a hard plateau, not a diminishing
-- tail. A soft 10% tail was tried and is wrong here -- with a commit worth 2 it
-- floors to 0 for one kind and 1 for another, so the rule disclosed to students
-- and the score actually computed could disagree. A ceiling is honest, easy to
-- state, and removes the incentive to pad.
--
-- These caps are the second line; the first is that the evidence must be
-- verified at all. They exist so that "verified" cannot be gamed by repetition.

CREATE OR REPLACE FUNCTION public.ranking_kind_cap(kind text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE kind
    WHEN 'event_attended' THEN 20
    WHEN 'solution_accepted' THEN 15
    WHEN 'roadmap_done' THEN 40
    WHEN 'project_verified' THEN 10
    WHEN 'oss_verified' THEN 15
    WHEN 'contest_top' THEN 5
    ELSE 0
  END
$$;

-- ---------------------------------------------------------------------------
-- 8. recompute_ranking_scores: verified-only, capped, tenant-correct
-- ---------------------------------------------------------------------------
-- Changes from 027:
--   - filters on verified_by IS NOT NULL (the trigger guarantees new rows, but
--     027-era rows are already in the table and are exactly the unverified ones)
--   - ON CONFLICT (tenant_id, user_id) and always assigns tenant_id, fixing the
--     cross-tenant overwrite described in section 3
--   - deletes rows for users who no longer have any verified evidence, so a
--     reversed claim actually removes a score instead of leaving it frozen
--   - ranks a row by its sequence number within its kind so the cap applies
--   - computes the tier from verified totals only

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
           public.ranking_decayed_weight(
             v.weight,
             v.created_at
           ) * (
             -- Full weight up to the cap; exactly zero past it.
             CASE WHEN v.seq <= public.ranking_kind_cap(v.kind) THEN 1.0 ELSE 0.0 END
           )::int AS contribution
      FROM verified v
  ),
  per_user AS (
    SELECT c.user_id,
           COALESCE(SUM(c.contribution), 0)::int AS score,
           COUNT(*) FILTER (WHERE c.kind = 'roadmap_done')      AS roadmap_done,
           COUNT(*) FILTER (WHERE c.kind = 'project_verified')  AS project_verified,
           COUNT(*) FILTER (WHERE c.kind = 'oss_verified')      AS oss_verified,
           COUNT(*) FILTER (WHERE c.kind = 'contest_top')       AS contest_top,
           COUNT(*) FILTER (WHERE c.kind = 'solution_accepted')  AS solution_accepted,
           COUNT(*) FILTER (WHERE c.kind = 'event_attended')    AS event_attended
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
           'event_attended', p.event_attended
         ),
         now()
    FROM per_user p
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    score = EXCLUDED.score,
    tier = EXCLUDED.tier,
    evidence = EXCLUDED.evidence,
    updated_at = now();

  GET DIAGNOSTICS cnt = ROW_COUNT;

  -- A reversed claim must remove the score, not leave it frozen at its last
  -- value. Without this, rejecting evidence in the audit queue would not lower
  -- anybody's standing.
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

-- ---------------------------------------------------------------------------
-- 9. Release flag
-- ---------------------------------------------------------------------------
-- Off by default, exactly like github_integration. Every student's current
-- standing was computed from self-declared rows; flipping this on retroactively
-- withdraws points they were shown as having earned. The chapter chooses the
-- moment, and /admin/flags is where it happens.
--
-- Seeded only when the tenant already exists and has no row for this key, so a
-- chapter that has customized its flags is not overwritten on re-run.

INSERT INTO public.feature_flags (tenant_id, key, enabled)
SELECT t.id, 'ranking_verified', false
  FROM public.tenants t
 WHERE NOT EXISTS (
   SELECT 1 FROM public.feature_flags f
    WHERE f.tenant_id = t.id AND f.key = 'ranking_verified'
 );

-- ---------------------------------------------------------------------------
-- 10. Honest comments
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.ranking_events IS
  'Verified evidence ledger. A BEFORE INSERT trigger rejects any row without verified_by, so no score exists without a named actor vouching for it. Read by the standings board when ranking_verified is on.';
COMMENT ON TABLE public.ranking_scores IS
  'Materialized per-tenant score, derived only from verified ranking_events by recompute_ranking_scores(). Composite key (tenant_id, user_id).';
COMMENT ON COLUMN public.student_roadmap_progress.evidence_state IS
  'provisional = claimed by the student and awaiting review (scores 0); verified = a lead confirmed it; rejected = refused.';
COMMENT ON COLUMN public.projects.evidence_state IS
  'provisional = repo claimed but no attested activity yet (scores 0); verified = a signed delivery proved work in the repo; rejected = refused.';