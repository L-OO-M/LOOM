-- 082_challenge_domains: give every challenge a domain.
--
-- The practice room was DSA-only by construction: practice_questions had no
-- domain, so a web or AI/ML member saw a LeetCode set and nothing else. Debug
-- challenges already carry a domain (078); this brings the other two challenge
-- sources in line so the roadmap can offer the right kind of practice.
--
-- Existing rows are backfilled honestly, not guessed:
--   practice_questions -> 'dsa'      (they ARE LeetCode questions)
--   contests           -> 'general'   (a chapter contest is not domain-specific
--                                      unless the chapter says so)
--
-- Idempotent: safe to re-run.

ALTER TABLE public.practice_questions
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'dsa';

ALTER TABLE public.practice_questions
  DROP CONSTRAINT IF EXISTS practice_questions_domain_check;
ALTER TABLE public.practice_questions
  ADD CONSTRAINT practice_questions_domain_check CHECK (
    domain IN ('ai_ml', 'web', 'cybersecurity', 'dsa', 'blockchain', 'embedded', 'backend', 'devops')
  );

CREATE INDEX IF NOT EXISTS practice_questions_domain_idx
  ON public.practice_questions (tenant_id, domain, week_id);

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'general';

ALTER TABLE public.contests
  DROP CONSTRAINT IF EXISTS contests_domain_check;
ALTER TABLE public.contests
  ADD CONSTRAINT contests_domain_check CHECK (
    domain IN ('ai_ml', 'web', 'cybersecurity', 'dsa', 'blockchain', 'embedded', 'backend', 'devops', 'general')
  );

CREATE INDEX IF NOT EXISTS contests_domain_idx
  ON public.contests (tenant_id, domain, status);

COMMENT ON COLUMN public.practice_questions.domain IS
  'Which track this question belongs to. DSA questions are the LeetCode weekly set; other domains use debug challenges or contests.';
COMMENT ON COLUMN public.contests.domain IS
  'general means the whole chapter; a domain value targets one track.';
