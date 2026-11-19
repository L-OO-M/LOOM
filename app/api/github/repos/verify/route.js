import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { readAccessToken } from "@/lib/github-oauth";
import { activateProvenProjects, confirmRepoGrant, githubTokenFailure } from "@/lib/github-grants";
import { checkRateLimit } from "@/lib/rate-limit";

// Add repositories to a linked account.
//
// This is the "Add repository" action the UI was missing: the student ticks the
// repositories they want and LOOM asks GitHub about each one with the token we
// already store. No second OAuth round trip, no silent grants from merely
// listing a page.
//
// Ownership still comes from GitHub, never from the request: the client sends
// `owner/repo` strings, and each one is resolved through GET /repos/{fullName}
// with the student's token. A repository they cannot see returns 404 and is
// reported as unverified rather than written as a claim.
const schema = z.object({
  repos: z
    .array(
      z
        .string()
        .max(140)
        .regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, "Use owner/repository")
    )
    .min(1, "Choose at least one repository")
    .max(10, "Add at most 10 repositories at a time")
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limited = checkRateLimit(request, { userId: user.id, limit: 12, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many repository checks — wait a minute", 429);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }
  const requested = [...new Set(body.repos)];

  const token = await readAccessToken({ sql, userId: user.id });
  if (!token.ok) return githubTokenFailure(token.reason);

  const [conn] = await sql`
    SELECT github_username, github_user_id FROM github_connections WHERE user_id = ${user.id} LIMIT 1
  `;
  // A grant without an immutable GitHub id cannot prove anything: the project
  // route requires the two ids to match. Rather than write half-proofs, send the
  // student through the link flow that establishes identity.
  if (!conn?.github_username || conn.github_user_id == null) {
    return fail(
      "GITHUB_RELINK_REQUIRED",
      "GitHub has not verified this account yet. Re-link it to add repositories.",
      409,
      { authorizeUrl: "/api/github/oauth/start" }
    );
  }

  const results = [];
  for (const fullName of requested) {
    const grant = await confirmRepoGrant({
      sql,
      accessToken: token.accessToken,
      userId: user.id,
      tenantId: tenant.id,
      login: conn.github_username,
      githubUserId: conn.github_user_id,
      fullName
    });
    results.push(grant.ok ? grant : { ok: false, repo: fullName, reason: grant.reason });
  }

  const added = results.filter((r) => r.ok);
  // A repository that was added earlier may belong to a project claimed before
  // the grant existed. Promote those now, so adding a repo cannot leave a
  // project stuck on "pending" with no visible reason.
  const activated = await activateProvenProjects({ sql, tenant, userId: user.id });

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: "verified_github_repos",
    resource: "github_repo_grant",
    resourceId: user.id,
    after: {
      requested: requested.length,
      added: added.map((r) => r.repo),
      failed: results.filter((r) => !r.ok).map((r) => ({ repo: r.repo, reason: r.reason })),
      activated
    }
  });

  // If GitHub rejected every call, say why. A 404 on every repository is an
  // access/typo answer the student can act on; anything else is an outage or a
  // dead token, not a per-repository result.
  if (added.length === 0) {
    const allMissing = results.every((r) => r.reason === "REPO_NOT_FOUND");
    if (allMissing) {
      return fail(
        "REPO_NOT_FOUND",
        "GitHub could not see those repositories. Check the names, and that the linked account still has access.",
        404
      );
    }
    return fail(
      "GITHUB_UNAVAILABLE",
      "GitHub could not confirm those repositories. Try again shortly, or re-link GitHub if this repeats.",
      502,
      { authorizeUrl: "/api/github/oauth/start" }
    );
  }

  return ok({
    added: added.length,
    activated,
    repos: results.map((r) => ({
      repo: r.repo,
      ok: r.ok,
      canPush: r.canPush ?? false,
      canAdmin: r.canAdmin ?? false,
      isPrivate: r.isPrivate ?? false,
      reason: r.reason ?? null
    }))
  });
}
