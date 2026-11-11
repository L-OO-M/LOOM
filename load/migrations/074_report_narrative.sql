-- 074_report_narrative: a lead-written narrative that travels with the filed
-- monthly report and its export.
--
-- WHY THIS EXISTS
--
-- `dept_reports.draft` is auto-compiled from live counts. The department's own
-- account of the month - what changed, what was hard, what comes next - had no
-- place to live, so it was either lost in chat or pasted into an unrelated
-- document. The narrative belongs to the same filed record: it locks when the
-- report is submitted, is included in CSV/PDF/JSON exports, and survives a
-- recompile of the numbers.
--
-- The limit mirrors the API schema (4000 characters) and leaves room for the
-- constraint to be the backstop rather than the first line of defence.
--
-- Idempotent throughout.

ALTER TABLE public.dept_reports
  ADD COLUMN IF NOT EXISTS narrative text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dept_reports_narrative_length'
      AND conrelid = 'public.dept_reports'::regclass
  ) THEN
    ALTER TABLE public.dept_reports
      ADD CONSTRAINT dept_reports_narrative_length
      CHECK (char_length(narrative) <= 4000);
  END IF;
END $$;

COMMENT ON COLUMN public.dept_reports.narrative IS
  'Lead-written account of the month; saved with the report, locked when submitted, included in every export format. Max 4000 characters.';
