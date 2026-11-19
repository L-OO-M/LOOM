// Cache the repositories a linked student can push to.
//
// This is metadata only. It is deliberately NOT an ownership proof: writing a
// grant is an explicit act (see lib/github-grants.js), so a student can tell
// which repositories they actually added and loading a picker cannot silently
// verify fifty of them.
//
// Two tables are involved, with different owners:
//   repositories        -- display metadata for the pickers (written here)
//   github_repo_grants  -- the ownership proof project creation reads
//                          (written by confirmRepoGrant)
import crypto from "node:crypto";

/**
 * Keep only repositories the authenticated account owns and can push to.
 * Organization repos are intentionally excluded: project ownership means the
 * repository sits under the student's own handle, which is what
 * `repoOwnershipOk` checks. Showing an org repo in the picker would offer a
 * choice project creation must reject.
 */
export function ownedRepos(repos, login) {
  if (!Array.isArray(repos) || !login) return [];
  return repos.filter(
    (r) => r?.fullName && r.canPush && String(r.owner).toLowerCase() === String(login).toLowerCase()
  );
}

/**
 * Upsert one GitHub page of owned repositories in a single round trip.
 *
 * The previous version issued two statements per repository (one for the cache,
 * one for a grant). With 50 owned repositories that was 100 sequential queries
 * through the pooler: measured at 18.4 s for a single picker load in this
 * repo's own environment, while the GitHub call itself took ~2 s. A page is now
 * one statement, which is also why the picker no longer looks stuck.
 */
export async function rememberRepoMetadata({ sql, userId, tenantId, login, repos }) {
  const own = ownedRepos(repos, login);
  if (own.length === 0) return [];

  const rows = own.map((repo) => ({
    id: crypto.randomUUID(),
    github_id: repo.githubId,
    owner: repo.owner,
    name: repo.name,
    full_name: repo.fullName,
    html_url: repo.htmlUrl,
    description: repo.description,
    language: repo.language,
    stars: repo.stars,
    forks: repo.forks,
    open_issues: repo.openIssues,
    topics: repo.topics,
    is_private: repo.isPrivate,
    is_fork: repo.isFork,
    default_branch: repo.defaultBranch,
    pushed_at: repo.pushedAt
  }));

  return sql`
    INSERT INTO repositories (
      id, student_id, tenant_id, github_id, owner, name, full_name, html_url, description,
      language, stars, forks, open_issues, topics, is_private, is_fork,
      default_branch, pushed_at, metadata_synced_at, updated_at, connected_at
    )
    SELECT
      x.id, ${userId}, ${tenantId ?? null}::uuid, x.github_id, x.owner, x.name, x.full_name, x.html_url,
      x.description, x.language, x.stars, x.forks, x.open_issues, x.topics, x.is_private, x.is_fork,
      x.default_branch, x.pushed_at, NOW(), NOW(), COALESCE(x.pushed_at, NOW())
    FROM jsonb_to_recordset(${rows}::jsonb) AS x(
      id text,
      github_id bigint,
      owner text,
      name text,
      full_name text,
      html_url text,
      description text,
      language text,
      stars integer,
      forks integer,
      open_issues integer,
      topics text[],
      is_private boolean,
      is_fork boolean,
      default_branch text,
      pushed_at timestamptz
    )
    ON CONFLICT (student_id, (lower(full_name))) DO UPDATE SET
      tenant_id = COALESCE(repositories.tenant_id, EXCLUDED.tenant_id),
      github_id = EXCLUDED.github_id,
      owner = EXCLUDED.owner,
      name = EXCLUDED.name,
      html_url = EXCLUDED.html_url,
      description = EXCLUDED.description,
      language = EXCLUDED.language,
      stars = EXCLUDED.stars,
      forks = EXCLUDED.forks,
      open_issues = EXCLUDED.open_issues,
      topics = EXCLUDED.topics,
      is_private = EXCLUDED.is_private,
      is_fork = EXCLUDED.is_fork,
      default_branch = EXCLUDED.default_branch,
      pushed_at = EXCLUDED.pushed_at,
      metadata_synced_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `;
}
