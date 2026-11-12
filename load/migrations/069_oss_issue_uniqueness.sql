-- 069_oss_issue_uniqueness: one claimed issue belongs to one student.
--
-- Two students could paste the same issue URL and both be verified, which made
-- one piece of work count twice. Pull requests and reviews are intentionally
-- excluded: several students can legitimately review the same PR, and a PR may
-- be claimed by its author and also appear as review work.
--
-- Existing duplicates are kept, but only the oldest claim survives the index;
-- later rows are marked rejected rather than deleted so the audit trail and the
-- student's history remain intact.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, lower(canonical_url)
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.student_oss_contributions
  WHERE contribution_type = 'issue'
    AND canonical_url IS NOT NULL
    AND status <> 'rejected'
)
UPDATE public.student_oss_contributions c
SET status = 'rejected',
    review_note = COALESCE(c.review_note, 'Duplicate issue claim superseded by the earliest claim.')
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS oss_issue_tenant_canonical_key
  ON public.student_oss_contributions (tenant_id, lower(canonical_url))
  WHERE contribution_type = 'issue' AND canonical_url IS NOT NULL;
