import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin, roleRank } from "@/lib/permissions";

const grantSchema = z.object({ level: z.enum(["core", "dept_lead"]) });

// Grant Core (Head/Co-Head of the dept, or admin) or assign dept_lead
// (admin only). Roles sync upward only — demotion stays on the admin
// students endpoint. Head and Co-Head are indistinguishable here by design.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id, userId } = await params;
  let body;
  try {
    body = grantSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [dept] = await sql`
    SELECT * FROM departments WHERE id = ${id}
      AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    LIMIT 1
  `;
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);

  const admin = isAdmin({ role: profile.role });
  const myLevel = (profile.memberships || []).find((m) => m.department_id === dept.id)?.level;
  if (body.level === "dept_lead" && !admin) {
    return fail("FORBIDDEN", "Only a Super Admin can assign department leads", 403);
  }
  if (body.level === "core" && !admin && myLevel !== "dept_lead") {
    return fail("FORBIDDEN", "Only the department's Head or Co-Head can grant Core status", 403);
  }

  const [target] = await sql`
    SELECT * FROM profiles WHERE user_id = ${userId}
      AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    LIMIT 1
  `;
  if (!target) return fail("NOT_FOUND", "User not in your college", 404);

  const [membership] = await sql`
    INSERT INTO department_memberships (user_id, department_id, level, core_requested)
    VALUES (${userId}, ${dept.id}, ${body.level}, false)
    ON CONFLICT (user_id, department_id) DO UPDATE SET level = EXCLUDED.level, core_requested = false
    RETURNING *
  `;
  // Upward-only role sync: core < dept_lead; never demote here.
  const wantRole = body.level === "dept_lead" ? "dept_lead" : "core";
  if (roleRank(target.role) < roleRank(wantRole)) {
    await sql`UPDATE profiles SET role = ${wantRole}, updated_at = NOW() WHERE user_id = ${userId}`;
  }
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "granted_membership",
    resource: "department", resourceId: dept.id,
    before: { role: target.role }, after: { userId, level: body.level, slug: dept.slug }
  });
  return ok({ membership });
}
