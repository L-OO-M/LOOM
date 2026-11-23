-- Practice beyond LeetCode.
--
-- The weekly room was DSA-only: a week had no track and a question was assumed
-- to be a LeetCode slug, so a Web lead could not assign a Frontend Mentor
-- challenge and an AI/ML lead could not assign a Kaggle competition.
--
-- `track` names the department the set belongs to (matched to the department
-- slug), so a member can see which track a week came from and the authoring API
-- can check the right lead. `url` is the hosted link itself; `source` names the
-- provider so the UI can label it honestly and the sync knows whether automatic
-- verification is even possible. Existing rows are backfilled as LeetCode DSA,
-- which is what they were.

ALTER TABLE public.practice_weeks
  ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'dsa';

ALTER TABLE public.practice_questions
  ADD COLUMN IF NOT EXISTS url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'leetcode';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'practice_weeks_track_check'
      AND conrelid = 'public.practice_weeks'::regclass
  ) THEN
    ALTER TABLE public.practice_weeks
      ADD CONSTRAINT practice_weeks_track_check
      CHECK (track ~ '^[a-z0-9_]+$');
  END IF;
END $$;

-- Rows written before this migration stored only the LeetCode slug. Rebuild the
-- link from it so the student card has a real destination instead of an empty
-- anchor.
UPDATE public.practice_questions
SET url = 'https://leetcode.com/problems/' || slug || '/'
WHERE url = ''
  AND source = 'leetcode'
  AND slug ~ '^[a-z0-9-]+$';

COMMENT ON COLUMN public.practice_weeks.track IS
  'Department slug that owns this set (dsa, ai_ml, web, cybersecurity, ...).';
COMMENT ON COLUMN public.practice_questions.url IS
  'The hosted challenge link the member opens. https only, enforced by the API.';
COMMENT ON COLUMN public.practice_questions.source IS
  'Provider key: leetcode (auto-verified) or a catalogue key such as kaggle.';
