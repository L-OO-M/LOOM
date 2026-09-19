import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  const [project] = await sql`SELECT * FROM projects WHERE id = ${id} LIMIT 1`;
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  // Tenant isolation: never leak a project from another tenant via UUID guessing.
  if (project.tenant_id && tenant?.id && project.tenant_id !== tenant.id) {
    return fail("NOT_FOUND", "Project not found", 404);
  }
  if (profile.role !== "admin" && project.owner_id !== user.id) return fail("FORBIDDEN", "Not your project", 403);
  return ok({ project });
}

const patchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["active", "completed", "archived"]).optional(),
  repoUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string().min(1).max(30)).max(8).optional(),
  roadmapNodeId: z.string().nullable().optional()
});

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  const [project] = await sql`SELECT * FROM projects WHERE id = ${id} LIMIT 1`;
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  // Tenant isolation: an admin from another tenant must not read or mutate
  // this project merely by knowing its UUID.
  if (project.tenant_id && tenant?.id && project.tenant_id !== tenant.id) {
    return fail("NOT_FOUND", "Project not found", 404);
  }
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
  const [updated] = await sql`
    UPDATE projects SET
      title = COALESCE(${body.title ?? null}, title),
      description = COALESCE(${body.description ?? null}, description),
      status = COALESCE(${body.status ?? null}, status),
      repo_url = COALESCE(${body.repoUrl ?? null}, repo_url),
      tags = ${nextTags},
      roadmap_node_id = ${nextNodeId},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_project", resource: "project", resourceId: id, before: { status: project.status }, after: { status: updated.status } });
  return ok({ project: updated });
}
