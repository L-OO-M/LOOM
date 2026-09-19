import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { homeForRole } from "@/lib/auth";

export async function GET(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const role = searchParams.get("role");
  const dept = searchParams.get("dept");
  const rows = await sql`
    SELECT p.*,
      (SELECT json_agg(json_build_object('slug', d.slug, 'level', m.level))
       FROM department_memberships m JOIN departments d ON d.id = m.department_id
       WHERE m.user_id = p.user_id) AS departments
    FROM profiles p
    WHERE (p.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      AND (${q ? sql`(p.name ILIKE ${"%" + q + "%"} OR p.user_id ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${role ? sql`p.role = ${role}` : sql`TRUE`})
      AND (${dept ? sql`EXISTS (SELECT 1 FROM department_memberships m JOIN departments d ON d.id = m.department_id WHERE m.user_id = p.user_id AND d.slug = ${dept})` : sql`TRUE`})
    ORDER BY p.updated_at DESC LIMIT 50
  `;
  return ok({ students: rows });
}

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["student", "core", "dept_lead", "vertical_lead", "admin"]),
  departmentId: z.string().uuid().nullable().optional(),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional()
});

export async function PATCH(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = roleSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [target] = await sql`SELECT * FROM profiles WHERE user_id = ${body.userId} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
  if (!target) return fail("NOT_FOUND", "Student not in your college", 404);
  // A lead without a scope is an inconsistent state (permission checks read
  // memberships, not just the role) — require the scope up front.
  let departmentId = null;
  if (body.role === "dept_lead") {
    if (!body.departmentId) return fail("VALIDATION_ERROR", "Choose the department this Head / Co-Head will lead", 400);
    const [dept] = await sql`SELECT id, slug FROM departments WHERE id = ${body.departmentId} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
    if (!dept) return fail("NOT_FOUND", "Department not found in your college", 404);
    departmentId = dept.id;
  }
  if (body.role === "vertical_lead" && !body.vertical) {
    return fail("VALIDATION_ERROR", "Choose the vertical (technical / non-technical) this lead owns", 400);
  }
  // Single transaction: profiles + memberships + departments + audit + notify.
  // Prevents partial-state gaps (role updated but membership not). Tenant-scoped
  // target was already verified above; all writes use that tenant.
  const updated = await sql.begin(async (tx) => {
    const [up] = await tx`
      UPDATE profiles SET role = ${body.role},
        vertical = ${body.role === "vertical_lead" ? body.vertical : null},
        updated_at = NOW()
      WHERE user_id = ${body.userId} RETURNING *
    `;
    // Demotion cleanup: when moving away from dept_lead, downgrade any
    // dept_lead memberships to core (preserves engagement history, Q1) and
    // free head/co_head slots where they were occupant.
    if (target.role === "dept_lead" && body.role !== "dept_lead") {
      await tx`
        UPDATE department_memberships SET level = 'core'
        WHERE user_id = ${body.userId} AND level = 'dept_lead'
      `;
      await tx`
        UPDATE departments
        SET head_user_id = CASE WHEN head_user_id = ${body.userId} THEN NULL ELSE head_user_id END,
            co_head_user_id = CASE WHEN co_head_user_id = ${body.userId} THEN NULL ELSE co_head_user_id END
        WHERE head_user_id = ${body.userId} OR co_head_user_id = ${body.userId}
      `;
    }
    if (departmentId) {
      await tx`
        INSERT INTO department_memberships (user_id, department_id, level, core_requested)
        VALUES (${body.userId}, ${departmentId}, 'dept_lead', false)
        ON CONFLICT (user_id, department_id) DO UPDATE SET level = 'dept_lead', core_requested = false
      `;
      await tx`
        UPDATE departments
        SET head_user_id = CASE WHEN head_user_id IS NULL THEN ${body.userId} ELSE head_user_id END,
            co_head_user_id = CASE WHEN head_user_id IS NOT NULL AND head_user_id <> ${body.userId} AND co_head_user_id IS NULL THEN ${body.userId} ELSE co_head_user_id END
        WHERE id = ${departmentId}
      `;
    }
    // Notify the promotee/demotee — same login picks it up via AppShell poll + inbox bell.
    const roleLabel = ({ student: "Student", core: "Core Member", dept_lead: "Department Head", vertical_lead: "Vertical Lead", admin: "Super Admin" }[body.role] || body.role);
    const didPromote = body.role !== target.role;
    if (didPromote) {
      try {
        await notify({
          sql: tx,
          tenantId: tenant?.id,
          userId: body.userId,
          type: "role_granted",
          title: `Your role is now ${roleLabel}`,
          body: body.role === "vertical_lead" ? `You now lead the ${body.vertical} vertical — open the Lead console.` : body.role === "dept_lead" ? "You now lead a department — open the Lead console." : `Role updated to ${roleLabel}.`,
          link: homeForRole(body.role),
        });
      } catch {}
    }
    await writeAudit({
      sql: tx,
      actorId: user.id,
      tenantId: tenant?.id,
      action: "updated_student_role",
      resource: "profile",
      resourceId: body.userId,
      before: { role: target.role, vertical: target.vertical },
      after: { role: body.role, vertical: body.role === "vertical_lead" ? body.vertical : null, departmentId },
    });
    return up;
  });
  return ok({ profile: updated });
}
