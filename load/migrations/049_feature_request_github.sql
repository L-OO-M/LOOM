-- 049_feature_request_github: link a feature request to a GitHub issue.
--
-- The integration is optional and additive. A chapter that has not configured
-- GITHUB_ISSUES_REPO / GITHUB_ISSUES_TOKEN keeps working exactly as before:
-- every column here is nullable and no existing row changes meaning.
--
-- The unique index is scoped to the repository because issue numbers are only
-- unique within a repo. It is partial so unsynced rows (all NULL) never collide.

ALTER TABLE public.feature_requests
  ADD COLUMN IF NOT EXISTS github_issue_number integer,
  ADD COLUMN IF NOT EXISTS github_issue_url text,
  ADD COLUMN IF NOT EXISTS github_issue_repo text,
  ADD COLUMN IF NOT EXISTS github_issue_state text,
  ADD COLUMN IF NOT EXISTS github_issue_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS github_issue_error text;

CREATE UNIQUE INDEX IF NOT EXISTS feature_requests_github_issue_unique
  ON public.feature_requests (github_issue_repo, github_issue_number)
  WHERE github_issue_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS feature_requests_github_number_idx
  ON public.feature_requests (github_issue_number)
  WHERE github_issue_number IS NOT NULL;
