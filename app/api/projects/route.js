import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const createSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).default(""),
  roadmapNodeId: z.string().optional().nullable(),
  repoUrl: z.string().url().optional().nullable().or(z.literal("").transform(() => null)),
  tags: z.array(z.string().min(1).max(30)).max(8).default([])
});

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const rows = profile.role === "admin"
    ? await sql`SELECT * FROM projects WHERE tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL ORDER BY created_at DESC LIMIT 100`
    : await sql`SELECT * FROM projects WHERE owner_id = ${user.id} ORDER BY created_at DESC LIMIT 100`;
  return ok({ projects: rows });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
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
  const [project] = await sql`
    INSERT INTO projects (tenant_id, owner_id, title, description, roadmap_node_id, status, repo_url, tags)
    VALUES (${tenant?.id ?? null}, ${user.id}, ${body.title}, ${body.description || ""}, ${body.roadmapNodeId || null}, 'active', ${body.repoUrl || null}, ${body.tags})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "created_project", resource: "project", resourceId: project.id, after: { title: body.title } });
  return ok({ project }, { status: 201 });
}
