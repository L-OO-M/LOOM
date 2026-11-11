import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const memberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["maintainer", "member"]).default("member")
});

async function loadProject({ sql, id, user, tenant }) {
  const [project] = await sql`
    SELECT id, tenant_id, owner_id, title FROM projects
    WHERE id = ${id}
      AND tenant_id = ${tenant?.id ?? null}::uuid
    LIMIT 1
  `;
  if (!project) return null;
  return project;
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

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const project = await loadProject({ sql, id, user, tenant });
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  const allowed = profile.role === "admin" || await canView({ sql, project, userId: user.id });
  if (!allowed) return fail("FORBIDDEN", "Not your project", 403);

  const members = await sql`
    SELECT pm.*, p.name, p.github_username
    FROM project_members pm
    LEFT JOIN profiles p ON p.user_id = pm.user_id
    WHERE pm.project_id = ${id} AND pm.tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY pm.created_at ASC
  `;
  return ok({ members });
}

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const project = await loadProject({ sql, id, user, tenant });
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  if (profile.role !== "admin" && project.owner_id !== user.id) {
    return fail("FORBIDDEN", "Only the owner can change the team", 403);
  }

  let body;
  try {
    body = memberSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.userId === project.owner_id) {
    return fail("OWNER_IS_IMPLICIT", "The owner is always on the project", 409);
  }

  const [target] = await sql`
    SELECT user_id, name FROM profiles
    WHERE user_id = ${body.userId} AND tenant_id = ${tenant?.id ?? null}::uuid
    LIMIT 1
  `;
  if (!target) return fail("MEMBER_NOT_FOUND", "That person is not in this chapter", 404);

  const [member] = await sql`
    INSERT INTO project_members (tenant_id, project_id, user_id, role)
    VALUES (${tenant?.id ?? null}, ${id}, ${body.userId}, ${body.role})
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
    RETURNING *
  `;

  await notify({
    sql, tenantId: tenant?.id, userId: body.userId,
    type: "project_team",
    title: "Added to a project",
    body: `${profile?.name || "A teammate"} added you to "${project.title}".`,
    link: `/student/projects/${id}`
  });
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "added_project_member", resource: "project", resourceId: id,
    after: { userId: body.userId, role: body.role }
  });
  return ok({ member }, { status: 201 });
}

export async function DELETE(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;

  const project = await loadProject({ sql, id, user, tenant });
  if (!project) return fail("NOT_FOUND", "Project not found", 404);
  if (profile.role !== "admin" && project.owner_id !== user.id) {
    return fail("FORBIDDEN", "Only the owner can change the team", 403);
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return fail("VALIDATION_ERROR", "userId is required", 400);

  const [removed] = await sql`
    DELETE FROM project_members
    WHERE project_id = ${id}
      AND tenant_id = ${tenant?.id ?? null}::uuid
      AND user_id = ${userId}
    RETURNING *
  `;
  if (!removed) return fail("NOT_FOUND", "That person is not on this project", 404);

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "removed_project_member", resource: "project", resourceId: id,
    before: { userId }
  });
  return ok({ removed: true, userId });
}
