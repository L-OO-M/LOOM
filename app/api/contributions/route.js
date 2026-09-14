import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { can, isAdmin } from "@/lib/permissions";

const postSchema = z.object({
  studentId: z.string().min(1).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  kind: z.enum(["project", "competition", "certification", "event"]).default("project"),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).default(""),
  evidenceUrl: z.string().url().max(500).nullable().optional()
});

// The contribution ledger (Plan 5.3/5.4): self-logged rows for every member,
// lead-logged rows for a lead's own department. One source feeding profiles,
// certificates, and department reports.
export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId") || user.id;
  const departmentId = searchParams.get("departmentId");

  if (studentId !== user.id) {
    // Reading another member's log needs a department scope + permission.
    if (!departmentId) return fail("VALIDATION_ERROR", "departmentId is required to view another member's log", 400);
    const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
    if (!isAdmin(me) && !can(me, "log_contribution", { departmentId }).ok) {
      return fail("FORBIDDEN", "Only leads of that department can view member logs", 403);
    }
  }
  const rows = await sql`
    SELECT c.*, d.name AS department_name, lp.name AS student_name, lg.name AS logged_by_name
    FROM member_contributions c
    LEFT JOIN departments d ON d.id = c.department_id
    LEFT JOIN profiles lp ON lp.user_id = c.student_id
    LEFT JOIN profiles lg ON lg.user_id = c.logged_by
    WHERE c.student_id = ${studentId}
      AND (c.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      AND (${departmentId ? sql`c.department_id = ${departmentId}` : sql`TRUE`})
    ORDER BY c.created_at DESC
    LIMIT 100
  `;
  return ok({ contributions: rows });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  let body;
  try {
    body = postSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const targetId = body.studentId || user.id;
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };

  if (targetId !== user.id) {
    // Logging on behalf of a member: needs log_contribution over the dept.
    if (!body.departmentId) return fail("VALIDATION_ERROR", "departmentId is required to log for another member", 400);
    if (!can(me, "log_contribution", { departmentId: body.departmentId, ownerId: targetId }).ok) {
      return fail("FORBIDDEN", "Only leads of that department can log for members", 403);
    }
    const [target] = await sql`
      SELECT 1 FROM department_memberships WHERE user_id = ${targetId} AND department_id = ${body.departmentId} LIMIT 1
    `;
    if (!target) return fail("NOT_FOUND", "That student is not in this department", 404);
  } else if (body.departmentId) {
    // Self-logging into a department requires belonging to it.
    const mine = (profile.memberships || []).some((m) => m.department_id === body.departmentId);
    if (!mine && !isAdmin(me)) return fail("FORBIDDEN", "You can only log into your own departments", 403);
  }

  const [row] = await sql`
    INSERT INTO member_contributions (student_id, tenant_id, department_id, kind, title, description, evidence_url, logged_by)
    VALUES (${targetId}, ${tenant?.id ?? null}, ${body.departmentId || null}, ${body.kind}, ${body.title}, ${body.description}, ${body.evidenceUrl || null}, ${user.id})
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "logged_contribution",
    resource: "contribution", resourceId: row.id,
    after: { studentId: targetId, kind: body.kind, title: body.title }
  });
  return ok({ contribution: row }, { status: 201 });
}
