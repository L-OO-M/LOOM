-- Contest judging: a submission now carries an outcome, a score, and feedback.
--
-- Before this migration an admin could read a submission but could not record a
-- judgement anywhere, so `contest_top` evidence was advertised in the ranking
-- model and never actually awarded. The columns are additive and nullable so
-- existing submissions stay valid and every read that selects `s.*` keeps
-- working.

ALTER TABLE public.contest_submissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'submitted';
ALTER TABLE public.contest_submissions
  ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE public.contest_submissions
  ADD COLUMN IF NOT EXISTS feedback text NOT NULL DEFAULT '';
ALTER TABLE public.contest_submissions
  ADD COLUMN IF NOT EXISTS judged_by text;
ALTER TABLE public.contest_submissions
  ADD COLUMN IF NOT EXISTS judged_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contest_submissions_status_check'
      AND conrelid = 'public.contest_submissions'::regclass
  ) THEN
    ALTER TABLE public.contest_submissions
      ADD CONSTRAINT contest_submissions_status_check
      CHECK (status IN ('submitted', 'shortlisted', 'winner', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contest_submissions_score_check'
      AND conrelid = 'public.contest_submissions'::regclass
  ) THEN
    ALTER TABLE public.contest_submissions
      ADD CONSTRAINT contest_submissions_score_check
      CHECK (score IS NULL OR (score >= 0 AND score <= 100));
  END IF;
END $$;

-- The submissions inbox reads newest-first per contest; judging looks up one
-- row by id. Keep the existing contest index and add the status view.
CREATE INDEX IF NOT EXISTS contest_submissions_status_idx
  ON public.contest_submissions(contest_id, status);
