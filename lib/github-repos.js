// Persist the repositories a linked student can push to.
//
// Two tables are written together on purpose:
//   repositories        -- display metadata for the project picker
//   github_repo_grants  -- the ownership proof project creation reads
//
// They used to drift because only the OAuth callback wrote a grant. A repo
// created from LOOM, or a repo whose metadata was refreshed, could exist in
// `repositories` while `POST /api/projects` still called it unproven. Writing
// both here keeps the proof and the picker in sync.
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

export async function rememberRepos({ sql, userId, tenantId, login, githubUserId, repos }) {
  const own = ownedRepos(repos, login);
  const saved = [];
  for (const repo of own) {
    const [row] = await sql`
      INSERT INTO repositories
        (id, student_id, tenant_id, github_id, owner, name, full_name, html_url, description,
         language, stars, forks, open_issues, topics, is_private, is_fork,
         default_branch, pushed_at, metadata_synced_at, updated_at, connected_at)
      VALUES (
        ${crypto.randomUUID()}, ${userId}, ${tenantId ?? null}::uuid, ${repo.githubId}, ${repo.owner}, ${repo.name},
        ${repo.fullName}, ${repo.htmlUrl}, ${repo.description}, ${repo.language},
        ${repo.stars}, ${repo.forks}, ${repo.openIssues}, ${repo.topics},
        ${repo.isPrivate}, ${repo.isFork}, ${repo.defaultBranch}, ${repo.pushedAt},
        NOW(), NOW(), COALESCE(${repo.pushedAt}::timestamptz, NOW())
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
    await sql`
      INSERT INTO github_repo_grants
        (user_id, tenant_id, repo_full_name, github_user_id, owner_login,
         can_push, can_admin, is_private, verified_at, updated_at)
      VALUES (
        ${userId}, ${tenantId ?? null}::uuid, ${repo.fullName}, ${githubUserId},
        ${repo.owner}, true, ${repo.canAdmin}, ${repo.isPrivate}, NOW(), NOW()
      )
      ON CONFLICT (user_id, repo_full_name) DO UPDATE SET
        tenant_id = COALESCE(github_repo_grants.tenant_id, EXCLUDED.tenant_id),
        github_user_id = EXCLUDED.github_user_id,
        owner_login = EXCLUDED.owner_login,
        can_push = EXCLUDED.can_push,
        can_admin = EXCLUDED.can_admin,
        is_private = EXCLUDED.is_private,
        verified_at = NOW(),
        updated_at = NOW()
    `;
    saved.push(row);
  }
  return saved;
}
