import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const schema = z.object({
  userId: z.string().min(1),
  departmentId: z.string().uuid(),
  ready: z.boolean()
});

// Flag a Core Member as succession-ready (or clear it). Either Head/Co-Head
// of the department, or an admin. Vertical leads read the flags; they don't set them.
export async function PATCH(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  let body;
  try {
    body = schema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const admin = isAdmin({ role: profile.role });
  const myLevel = (profile.memberships || []).find((m) => m.department_id === body.departmentId)?.level;
  if (!admin && myLevel !== "dept_lead") {
    return fail("FORBIDDEN", "Only the department's Head or Co-Head can mark succession", 403);
  }
  const [row] = await sql`
    UPDATE department_memberships SET succession_ready = ${body.ready}
    WHERE user_id = ${body.userId} AND department_id = ${body.departmentId}
      AND level IN ('core', 'dept_lead')
    RETURNING *
  `;
  if (!row) return fail("NOT_FOUND", "No core member found in that department", 404);
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: body.ready ? "marked_succession_ready" : "cleared_succession_ready",
    resource: "department", resourceId: body.departmentId, after: { userId: body.userId }
  });
  return ok({ membership: row });
}
