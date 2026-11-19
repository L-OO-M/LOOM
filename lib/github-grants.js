// Explicit repository grants.
//
// A grant is the durable answer to one question: "can this student push to
// owner/repo?" It is written only after GitHub confirms the repository with the
// student's own token -- never from a typed string, and never as a side effect
// of listing repositories. The explicit write is what makes "Add a repository"
// a real action with visible results instead of a checkbox that is already
// disabled because a page load verified everything.
import { fail } from "@/lib/api";
import { fetchRepoPermissions } from "@/lib/github-oauth";
import { recordEvidence, recomputeScore } from "@/lib/ranking";

/**
 * Ask GitHub about one repository and store the answer.
 *
 * `can_push` is ownership, not mere access: a collaborator with push rights is
 * not the author of the repository, and project ownership is about authorship.
 * The row is still stored for a collaborator with `can_push = false` so the
 * page can say "Needs review" instead of silently pretending the repo does not
 * exist -- the same distinction the OAuth callback has always made.
 */
export async function confirmRepoGrant({
  sql,
  accessToken,
  userId,
  tenantId,
  login,
  githubUserId,
  fullName,
  fetchImpl = fetch
}) {
  const perm = await fetchRepoPermissions({ accessToken, fullName, fetchImpl });
  if (!perm.ok) return { ok: false, reason: perm.reason };

  const ownsIt =
    perm.canPush === true && String(perm.owner).toLowerCase() === String(login).toLowerCase();

  await sql`
    INSERT INTO github_repo_grants
      (user_id, tenant_id, repo_full_name, github_user_id, owner_login, can_push, can_admin, is_private, verified_at, updated_at)
    VALUES (
      ${userId}, ${tenantId ?? null}::uuid, ${perm.fullName}, ${githubUserId}, ${perm.owner},
      ${ownsIt}, ${perm.canAdmin}, ${perm.private}, NOW(), NOW()
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

  return {
    ok: true,
    repo: perm.fullName,
    canPush: ownsIt,
    canAdmin: perm.canAdmin,
    isPrivate: perm.private
  };
}

/**
 * Verify every provisional project whose repository now has a grant.
 *
 * Returns the number promoted. The grant and the project belong to the same
 * user, tenant, and immutable GitHub account -- a grant from a previous GitHub
 * identity must not verify a project after a re-link, which is what the join on
 * github_connections enforces.
 *
 * Reading the grants from the database (rather than only the repositories in
 * the current request) is deliberate: it also repairs projects that were
 * claimed before their repository was added. "I added the repo but the project
 * still says pending" is exactly the state this sweep exists to end.
 */
export async function activateProvenProjects({ sql, tenant, userId }) {
  if (!tenant?.id) return 0;

  const proven = await sql`
    SELECT p.id, p.repo_full_name AS repo
    FROM projects p
    JOIN github_repo_grants g
      ON g.user_id = p.owner_id
     AND g.tenant_id = p.tenant_id
     AND lower(g.repo_full_name) = lower(p.repo_full_name)
    JOIN github_connections c
      ON c.user_id = g.user_id
     AND c.github_user_id = g.github_user_id
    WHERE p.owner_id = ${userId}
      AND p.tenant_id = ${tenant.id}::uuid
      AND p.evidence_state = 'provisional'
      AND g.tenant_id = ${tenant.id}::uuid
      AND g.can_push = true
  `;

  let activated = 0;
  for (const project of proven) {
    const [updated] = await sql`
      UPDATE projects
         SET evidence_state = 'verified', verified_at = NOW(), verified_by = ${`github:${project.repo}`}, updated_at = NOW()
       WHERE id = ${project.id} AND evidence_state = 'provisional'
      RETURNING *
    `;
    if (!updated) continue; // lost the race to a concurrent delivery or an admin
    await recordEvidence({
      sql, tenantId: tenant.id, userId, kind: "project_verified", refId: project.id,
      verifiedBy: `github:${project.repo}`, source: "webhook",
      evidence: { repository: project.repo, via: "oauth_repo_grant" }
    });
    activated += 1;
  }
  if (activated) await recomputeScore(sql, tenant.id, userId);
  return activated;
}

/**
 * The same three failure shapes every GitHub-backed route needs to render.
 *
 * Kept here so a new route cannot invent a fourth wording for "your token
 * expired" -- the picker checks these codes to decide whether to offer the
 * re-link link at all.
 */
export function githubTokenFailure(reason) {
  if (reason === "NOT_LINKED") {
    return fail("GITHUB_NOT_LINKED", "Link your GitHub account first.", 409);
  }
  if (reason === "TOKEN_EXPIRED" || reason === "TOKEN_UNREADABLE") {
    return fail("GITHUB_RELINK_REQUIRED", "Your GitHub link has expired. Re-link it to continue.", 409, {
      authorizeUrl: "/api/github/oauth/start"
    });
  }
  if (reason === "SCOPE_MISSING" || reason === "TOKEN_REJECTED") {
    return fail(
      "GITHUB_SCOPE_MISSING",
      "Your GitHub token cannot read or create repositories. Re-link GitHub and approve repository access.",
      403,
      { authorizeUrl: "/api/github/oauth/start" }
    );
  }
  return fail("GITHUB_UNAVAILABLE", "GitHub could not be reached. Try again shortly.", 502);
}
