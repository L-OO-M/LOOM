import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const createSchema = z.object({
  title: z.string().trim().min(2).max(120)
});

const patchSchema = z.object({
  milestoneId: z.string().uuid(),
  title: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["todo", "doing", "done"]).optional()
}).refine((v) => v.title !== undefined || v.status !== undefined, {
  message: "Nothing to update"
});

async function loadProject({ sql, id, tenant }) {
  const [project] = await sql`
    SELECT id, tenant_id, owner_id FROM projects
    WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid
    LIMIT 1
  `;
  return project || null;
}

async function canView({ sql, project, userId }) {
  if (project.owner_id === userId) return true;
  const [member] = await sql`
    SELECT 1 FROM project_members
    WHERE project_id = ${project.id} AND user_id = ${userId}
    LIMIT 1
  `;
  return Boolean(member);
}

async function canEdit({ sql, project, userId, role }) {
  if (role === "admin" || project.owner_id === userId) return true;
  const [member] = await sql`
    SELECT 1 FROM project_members
    WHERE project_id = ${project.id} AND user_id = ${userId} AND role = 'maintainer'
    LIMIT 1
  `;
  return Boolean(member);
}

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const project = await loadProject({ sql, id, tenant });
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  const allowed = profile.role === "admin" || await canView({ sql, project, userId: user.id });
  if (!allowed) return fail("FORBIDDEN", "Not your project", 403);

  const milestones = await sql`
    SELECT * FROM project_milestones
    WHERE project_id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY position ASC, created_at ASC
  `;
  return ok({ milestones });
}

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const project = await loadProject({ sql, id, tenant });
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  if (!await canEdit({ sql, project, userId: user.id, role: profile.role })) {
    return fail("FORBIDDEN", "Only the owner or a maintainer can plan milestones", 403);
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const [{ next = 0 } = {}] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next
    FROM project_milestones
    WHERE project_id = ${id}
  `;
  const [milestone] = await sql`
    INSERT INTO project_milestones (tenant_id, project_id, title, position)
    VALUES (${tenant?.id ?? null}, ${id}, ${body.title}, ${next})
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "created_project_milestone", resource: "project", resourceId: id,
    after: { milestoneId: milestone.id, title: milestone.title }
  });
  return ok({ milestone }, { status: 201 });
}

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const project = await loadProject({ sql, id, tenant });
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  if (!await canEdit({ sql, project, userId: user.id, role: profile.role })) {
    return fail("FORBIDDEN", "Only the owner or a maintainer can plan milestones", 403);
  }

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const [milestone] = await sql`
    UPDATE project_milestones SET
      title = COALESCE(${body.title ?? null}, title),
      status = COALESCE(${body.status ?? null}, status),
      completed_at = CASE
        WHEN ${body.status === "done"} THEN COALESCE(completed_at, NOW())
        WHEN ${body.status !== undefined} THEN NULL
        ELSE completed_at
      END,
      updated_at = NOW()
    WHERE id = ${body.milestoneId}
      AND project_id = ${id}
      AND tenant_id = ${tenant?.id ?? null}::uuid
    RETURNING *
  `;
  if (!milestone) return fail("NOT_FOUND", "Milestone not found", 404);

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "updated_project_milestone", resource: "project", resourceId: id,
    after: { milestoneId: milestone.id, status: milestone.status }
  });
  return ok({ milestone });
}

export async function DELETE(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const project = await loadProject({ sql, id, tenant });
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  if (!await canEdit({ sql, project, userId: user.id, role: profile.role })) {
    return fail("FORBIDDEN", "Only the owner or a maintainer can plan milestones", 403);
  }

  const milestoneId = new URL(request.url).searchParams.get("milestoneId");
  if (!milestoneId) return fail("VALIDATION_ERROR", "milestoneId is required", 400);

  const [removed] = await sql`
    DELETE FROM project_milestones
    WHERE id = ${milestoneId}
      AND project_id = ${id}
      AND tenant_id = ${tenant?.id ?? null}::uuid
    RETURNING *
  `;
  if (!removed) return fail("NOT_FOUND", "Milestone not found", 404);

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "deleted_project_milestone", resource: "project", resourceId: id,
    before: { milestoneId, title: removed.title }
  });
  return ok({ removed: true, milestoneId });
}
