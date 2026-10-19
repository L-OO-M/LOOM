import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { parseGitHubRepo, recomputeScore, revokeEvidence } from "@/lib/ranking";

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  // Tenant predicate in SQL, not in JavaScript after the read.
  //
  // This used to load the row first and then reject it with a guard that tested
  // both sides for null before comparing them -- so it was skipped whenever the
  // project or the caller had no tenant. A foreign project was therefore
  // fetched into process memory on every request. Filtering in the query means
  // a foreign project is never read at all.
  const [project] = await sql`
    SELECT * FROM projects
    WHERE id = ${id}
      AND (tenant_id = ${tenant?.id ?? null}::uuid
           OR (tenant_id IS NULL AND owner_id = ${user.id}))
    LIMIT 1`;
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  if (profile.role !== "admin" && project.owner_id !== user.id) return fail("FORBIDDEN", "Not your project", 403);
  return ok({ project });
}

// `status` is the student's own organization of their work and no longer
// affects standing. It used to: the board counted every row except 'archived',
// which meant the score was awarded at creation and archiving was the only
// de-listing lever — student-controlled, so it protected nothing.
const patchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["active", "completed", "archived"]).optional(),
  repoUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string().min(1).max(30)).max(8).optional(),
  roadmapNodeId: z.string().nullable().optional()
});

// evidence_state, verified_by and verified_at are NOT in the patch schema and
// never were. A student cannot promote their own claim.

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  // Same reasoning as the GET above: filter in SQL so a foreign project is never
  // read, rather than loading it and rejecting afterwards.
  const [project] = await sql`
    SELECT * FROM projects
    WHERE id = ${id}
      AND (tenant_id = ${tenant?.id ?? null}::uuid
           OR (tenant_id IS NULL AND owner_id = ${user.id}))
    LIMIT 1`;
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  if (profile.role !== "admin" && project.owner_id !== user.id) return fail("FORBIDDEN", "Not your project", 403);
  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.roadmapNodeId) {
    const [node] = await sql`SELECT id FROM roadmap_nodes WHERE id = ${body.roadmapNodeId} LIMIT 1`;
    if (!node) return fail("NODE_NOT_FOUND", "Roadmap node not found", 404);
  }
  const nextTags = body.tags !== undefined ? body.tags.map((t) => t.toLowerCase()) : project.tags;
  const nextNodeId = body.roadmapNodeId === undefined ? project.roadmap_node_id : body.roadmapNodeId;

  // Changing OR removing the repository invalidates the claim. The repo is what
  // the evidence was about, so a swapped or cleared url must drop the
  // verification back to provisional rather than carry the old standing onto an
  // unrelated repo (or onto nothing at all).
  let nextRepoFullName;
  if (body.repoUrl === undefined) {
    nextRepoFullName = project.repo_full_name;
  } else if (body.repoUrl === null) {
    nextRepoFullName = null; // explicit clear — the field is optional
  } else {
    nextRepoFullName = parseGitHubRepo(body.repoUrl);
    if (!nextRepoFullName) {
      return fail("REPO_URL_INVALID", "Link a GitHub repository (github.com/owner/repo)", 400);
    }
  }
  const repoChanged = body.repoUrl !== undefined && nextRepoFullName !== project.repo_full_name;
  // Direct assignment (not COALESCE) so an explicit null actually clears both
  // columns; COALESCE kept the old url and made the "optional" field sticky.
  const nextRepoUrl = body.repoUrl === undefined
    ? project.repo_url
    : (nextRepoFullName ? body.repoUrl : null);

  const [updated] = await sql`
    UPDATE projects SET
      title = COALESCE(${body.title ?? null}, title),
      description = COALESCE(${body.description ?? null}, description),
      status = COALESCE(${body.status ?? null}, status),
      repo_url = ${nextRepoUrl},
      tags = ${nextTags},
      roadmap_node_id = ${nextNodeId},
      repo_full_name = ${nextRepoFullName},
      evidence_state = CASE WHEN ${repoChanged} THEN 'provisional' ELSE evidence_state END,
      verified_by = CASE WHEN ${repoChanged} THEN NULL ELSE verified_by END,
      verified_at = CASE WHEN ${repoChanged} THEN NULL ELSE verified_at END,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  // A swapped or cleared repo withdraws the standing that was awarded for the
  // OLD repo, and the recompute is derived so the board can never drift. The
  // subject is the project's owner, not the caller — an admin may edit another
  // student's row. Archiving below withdraws standing for the same reason.
  if (repoChanged || body.status === "archived") {
    await revokeEvidence({
      sql, tenantId: tenant?.id, userId: project.owner_id, kind: "project_verified", refId: id
    });
    await recomputeScore(sql, tenant?.id, project.owner_id);
  }
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_project", resource: "project", resourceId: id, before: { status: project.status, repo: project.repo_full_name }, after: { status: updated.status, repo: updated.repo_full_name } });
  return ok({ project: updated });
}
