-- 052_oss_catalogue_dedupe: GitHub owner/repo names are case-insensitive, so
-- the catalogue key must be too. The original six-row seed contained
-- `freeCodeCamp/freeCodeCamp`; a later curated seed added the lower-case form
-- and both rows appeared in the picker.
--
-- Keep the oldest row, but only delete a duplicate that no contribution points
-- at. If one is referenced, leave it for a human: silently moving evidence is
-- worse than a duplicate.

DELETE FROM public.open_source_projects a
USING public.open_source_projects b
WHERE a.created_at > b.created_at
  AND lower(a.owner || '/' || a.repo_name) = lower(b.owner || '/' || b.repo_name)
  AND NOT EXISTS (
    SELECT 1 FROM public.student_oss_contributions c WHERE c.project_id = a.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS oss_projects_identity_key
  ON public.open_source_projects(lower(owner || '/' || repo_name));
