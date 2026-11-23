-- Practice questions follow their department track.
--
-- 082 pinned practice_questions.domain to eight technical values, which was
-- correct while every question was a LeetCode problem. Weeks now belong to a
-- department (105) and a question carries the track that authored it, so the
-- fixed list rejects a legitimate department slug — and a chapter that adds its
-- own department should not need a migration to run practice.
--
-- The shape stays constrained (lowercase slug), only the closed set is gone.
-- Existing rows are unchanged: they are already valid slugs.

ALTER TABLE public.practice_questions
  DROP CONSTRAINT IF EXISTS practice_questions_domain_check;

ALTER TABLE public.practice_questions
  ADD CONSTRAINT practice_questions_domain_check CHECK (domain ~ '^[a-z0-9_]+$');

COMMENT ON COLUMN public.practice_questions.domain IS
  'Department track that authored this question (dsa, ai_ml, web, ...). Lowercase slug; no closed list so a chapter can add a department.';
