-- 058_schema_integrity: close two audited schema gaps.
--
-- 1. `planner_sessions.owner_user_id` was created as uuid, but the account key
--    everywhere else (`profiles.user_id`) is text. The mismatch made the
--    handover reassignment path unsafe once a non-uuid account id appeared.
--    Convert in place; existing uuid values stringify cleanly.
--
-- 2. A student could create several project rows pointing at the same repo.
--    `ranking_events` deduped the score, but the project list still showed
--    duplicate claims. Enforce one row per (tenant, owner, repo) at the
--    database boundary. The partial predicate keeps projects without a repo
--    (legacy rows) unaffected.
--
-- Both statements are idempotent. The unique index is created only after the
-- duplicate check in the application migration review; production currently
-- has no duplicates.

DROP INDEX IF EXISTS public.planner_sessions_owner_idx;

ALTER TABLE public.planner_sessions
  ALTER COLUMN owner_user_id TYPE text USING owner_user_id::text;

CREATE INDEX IF NOT EXISTS planner_sessions_owner_idx
  ON public.planner_sessions (tenant_id, owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS projects_tenant_owner_repo_unique
  ON public.projects (tenant_id, owner_id, lower(repo_full_name))
  WHERE repo_full_name IS NOT NULL;
