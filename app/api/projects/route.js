import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { parseGitHubRepo, repoOwnershipOk, recordEvidence, recomputeScore } from "@/lib/ranking";
import { checkRateLimit } from "@/lib/rate-limit";

// repo_url is REQUIRED.
//
// It used to be `z.string().url().optional().nullable()`, and the score was
// awarded at insert. So `POST /api/projects {"title":"x"}` returned a fully
// credited project: +25 on the public board, with no rate limit, no per-owner
// cap, and no requirement that any code existed. Ten requests, 250 points,
// under a second. Requiring a repository makes the empty-registry attack
// pointless — an unwritten repo proves nothing, so it earns nothing.
const createSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).default(""),
  roadmapNodeId: z.string().optional().nullable(),
  repoUrl: z.string().url("Link the GitHub repository for this project"),
  tags: z.array(z.string().min(1).max(30)).max(8).default([])
});

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  const rows = profile.role === "admin"
    ? await sql`SELECT * FROM projects WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL ORDER BY created_at DESC LIMIT 100`
    : await sql`SELECT * FROM projects WHERE owner_id = ${user.id} AND tenant_id = ${tid}::uuid ORDER BY created_at DESC LIMIT 100`;
  return ok({ projects: rows });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;

  // Unbounded creation was the cheapest exploit in the system. The repository
  // requirement is the real control; this is the cost floor on top of it.
  const limited = checkRateLimit(request, { userId: user.id, limit: 20, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many projects created — try again shortly", 429);

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.roadmapNodeId) {
    const [node] = await sql`SELECT id FROM roadmap_nodes WHERE id = ${body.roadmapNodeId} LIMIT 1`;
    if (!node) return fail("NODE_NOT_FOUND", "Roadmap node not found", 404);
  }

  // Ownership must be PROVEN, not asserted. There are two acceptable proofs and
  // they are not equal:
  //
  //   1. A github_repo_grants row: we asked GitHub, with this student's token,
  //      and GitHub said they have push access and own it. Migration 038.
  //   2. Legacy: the repo owner matches the claimed handle. This is still only
  //      an assertion, and it is kept only so members who have not linked yet
  //      are not locked out -- it cannot raise evidence_state above
  //      'provisional' either way.
  //
  // The original bug was accepting a repo with no check at all and awarding
  // points at insert, so an empty row was worth 25.
  const fullName = parseGitHubRepo(body.repoUrl);
  if (!fullName) {
    return fail("REPO_URL_INVALID", "Link a GitHub repository (github.com/owner/repo)", 400);
  }

  const [conn] = await sql`
    SELECT github_username, github_user_id FROM github_connections WHERE user_id = ${user.id} LIMIT 1
  `;
  if (!conn?.github_username) {
    return fail(
      "GITHUB_NOT_LINKED",
      "Link your GitHub account first — a project must sit on a repository you own",
      409
    );
  }

  // Strongest available proof. Also the only path that can activate a project
  // with zero webhook deliveries, which is the common case: a student's personal
  // repository has no webhook and never will unless we install one.
  const [grant] = await sql`
    SELECT can_push, can_admin, github_user_id FROM github_repo_grants
    WHERE user_id = ${user.id}
      AND tenant_id = ${tenant?.id ?? null}::uuid
      AND lower(repo_full_name) = lower(${fullName})
    LIMIT 1
  `;
  // can_push AND the owner segment matches the grant's owner_login AND the
  // grant belongs to the same immutable GitHub account. Any one of those alone
  // would be gameable.
  const proven =
    !!grant &&
    grant.can_push === true &&
    repoOwnershipOk({ fullName, githubUsername: conn.github_username }) &&
    conn.github_user_id != null &&
    Number(grant.github_user_id) === Number(conn.github_user_id);

  if (!proven && !repoOwnershipOk({ fullName, githubUsername: conn.github_username })) {
    return fail(
      "REPO_NOT_OWNED",
      `That repository belongs to another account. Link a repository under @${conn.github_username}.`,
      403
    );
  }

  // One claim per repository per student. Without this, the UNIQUE constraint
  // on ranking_events would stop a double count but not a triple of separate
  // project rows all pointing at one real repo.
  const [dupe] = await sql`
    SELECT id FROM projects
    WHERE owner_id = ${user.id} AND repo_full_name = ${fullName} LIMIT 1
  `;
  if (dupe) {
    return fail("REPO_ALREADY_CLAIMED", "You have already claimed that repository", 409);
  }

  // A proven repository may start verified -- GitHub has already vouched for it,
  // so there is nothing left to wait for and no reviewer needed. Everything else
  // is provisional and scores zero.
  const verifiedAt = proven ? new Date().toISOString() : null;
  const [project] = await sql`
    INSERT INTO projects (tenant_id, owner_id, title, description, roadmap_node_id, status, repo_url, tags, repo_full_name, evidence_state, verified_at, verified_by)
    VALUES (${tenant?.id ?? null}, ${user.id}, ${body.title}, ${body.description || ""}, ${body.roadmapNodeId || null}, 'active', ${body.repoUrl}, ${body.tags}, ${fullName}, ${proven ? "verified" : "provisional"}, ${verifiedAt}, ${proven ? `github:${fullName}` : null})
    RETURNING *
  `;
  if (proven) {
    await recordEvidence({
      sql, tenantId: tenant?.id, userId: user.id, kind: "project_verified", refId: project.id,
      verifiedBy: `github:${fullName}`, source: "webhook",
      evidence: { repository: fullName, via: "oauth_repo_grant", can_admin: grant.can_admin }
    });
    await recomputeScore(sql, tenant?.id, user.id);
  }
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "created_project", resource: "project", resourceId: project.id,
    after: { title: body.title, repoFullName: fullName, proven, evidenceState: project.evidence_state }
  });
  return ok({ project, verified: proven }, { status: 201 });
}