-- 059_project_repo_unique_active: allow an archived project's repository to be
-- claimed again, while still forbidding duplicate live claims.
--
-- 058 created the unique index across every row. Archiving is how a student
-- retires a project, and the UI treats the repository as claimable again after
-- that (the evidence row is revoked). Keep the database invariant aligned with
-- that behaviour: uniqueness applies only to non-archived rows.

DROP INDEX IF EXISTS public.projects_tenant_owner_repo_unique;

CREATE UNIQUE INDEX IF NOT EXISTS projects_tenant_owner_repo_unique
  ON public.projects (tenant_id, owner_id, lower(repo_full_name))
  WHERE repo_full_name IS NOT NULL
    AND status <> 'archived';
