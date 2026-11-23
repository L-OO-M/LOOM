import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit, notify } from "@/lib/auth-server";
import { scope } from "@/lib/tenant-scope";

const addSchema = z.object({
  userId: z.string().min(1).max(64),
  level: z.enum(["general", "core"]).default("general")
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

// Add an existing chapter member to this department. Heads may grant General
// or Core inside their own department. Head appointments are deliberately owned
// by the atomic admin role-management route, never a roster endpoint.
export async function POST(request, { params }) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireCan("manage_department_roster", { departmentId: id });
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;

  const [dept] = await sql`
    SELECT id, name, slug FROM departments
    WHERE id = ${id} AND tenant_id = ${scope(tenant?.id ?? null)}::uuid AND is_active
    LIMIT 1
  `;
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);

  let body;
  try {
    body = addSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const [target] = await sql`
    SELECT user_id, name, role FROM profiles
    WHERE user_id = ${body.userId} AND tenant_id = ${scope(tenant?.id ?? null)}::uuid
    LIMIT 1
  `;
  if (!target) return fail("NOT_FOUND", "User not in your college", 404);

  const [existing] = await sql`
    SELECT level FROM department_memberships
    WHERE user_id = ${body.userId} AND department_id = ${dept.id}::uuid
    LIMIT 1
  `;
  if (existing?.level === "dept_lead") {
    return fail("FORBIDDEN", "A department Head is appointed by a Super Admin, not edited here", 403);
  }

  const [membership] = await sql`
    INSERT INTO department_memberships (user_id, department_id, level, core_requested, tenant_id)
    VALUES (${body.userId}, ${dept.id}, ${body.level}, false, ${tenant.id})
    ON CONFLICT (user_id, department_id)
      DO UPDATE SET level = EXCLUDED.level, core_requested = false
    RETURNING *
  `;

  if (body.level === "core" && target.role === "student") {
    await sql`UPDATE profiles SET role = 'core', updated_at = NOW() WHERE user_id = ${body.userId}`;
  }

  // A direct grant answers a request that was already waiting. Leaving it open
  // would put a member who is already Core back in the decision queue.
  if (body.level === "core") {
    await sql`
      UPDATE role_requests
      SET status = 'approved', decided_by = ${user.id}, decided_at = NOW(),
          decision_reason = 'Granted directly from the department roster.'
      WHERE user_id = ${body.userId} AND department_id = ${dept.id}::uuid
        AND target_role = 'core' AND status = 'open'
        AND tenant_id = ${tenant.id}::uuid
    `;
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: existing ? "department_member.level" : "department_member.added",
    resource: "department",
    resourceId: dept.id,
    before: existing ? { level: existing.level } : null,
    after: { userId: body.userId, level: body.level, slug: dept.slug }
  });

  if (body.userId !== user.id) {
    await notify({
      sql, tenantId: tenant.id, userId: body.userId, type: "department_membership",
      title: `You were added to ${dept.name}`,
      body: body.level === "core" ? "As a Core member." : "As a General member.",
      link: "/student"
    });
  }

  return ok({ membership }, { status: 201 });
}
