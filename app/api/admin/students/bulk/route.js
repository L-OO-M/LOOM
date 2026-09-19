import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { homeForRole } from "@/lib/auth";

const bulkSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(50),
  role: z.enum(["student", "core", "dept_lead", "vertical_lead", "admin"]),
  departmentId: z.string().uuid().nullable().optional(),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional(),
});

// Bulk role assignment for the user-management table. Super Admin only,
// audited once with the full list. Membership levels are untouched — use
// the department grant endpoints for those.
export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = bulkSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  // Parity with single-target: scoped validates, txn for atomicity.
  if (body.role === "dept_lead" && !body.departmentId) {
    return fail("VALIDATION_ERROR", "Choose the department this batch will lead", 400);
  }
  if (body.role === "vertical_lead" && !body.vertical) {
    return fail("VALIDATION_ERROR", "Choose the vertical (technical / non-technical) for this batch", 400);
  }
  let departmentId = null;
  if (body.role === "dept_lead") {
    const [dept] = await sql`SELECT id FROM departments WHERE id = ${body.departmentId} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
    if (!dept) return fail("NOT_FOUND", "Department not found in your college", 404);
    departmentId = dept.id;
  }

  const updatedIds = await sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE profiles SET role = ${body.role},
        vertical = ${body.role === "vertical_lead" ? body.vertical : null},
        updated_at = NOW()
      WHERE user_id = ANY(${body.userIds})
        AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      RETURNING user_id
    `;
    const ids = rows.map((r) => r.user_id);
    if (ids.length === 0) return ids;

    // Q1/Q2 defaults: demoted dept_leads downgrade to core; single vertical per batch.
    // Handle demotion + promotion in same txn to avoid half-state.
    // Downgrade any pre-existing dept_lead memberships for users no longer dept_lead.
    if (body.role !== "dept_lead") {
      await tx`
        UPDATE department_memberships SET level = 'core'
        WHERE user_id = ANY(${ids}) AND level = 'dept_lead'
      `;
      await tx`
        UPDATE departments
        SET head_user_id = CASE WHEN head_user_id = ANY(${ids}) THEN NULL ELSE head_user_id END,
            co_head_user_id = CASE WHEN co_head_user_id = ANY(${ids}) THEN NULL ELSE co_head_user_id END
        WHERE head_user_id = ANY(${ids}) OR co_head_user_id = ANY(${ids})
      `;
    }

    if (departmentId) {
      for (const uid of ids) {
        await tx`
          INSERT INTO department_memberships (user_id, department_id, level, core_requested)
          VALUES (${uid}, ${departmentId}, 'dept_lead', false)
          ON CONFLICT (user_id, department_id) DO UPDATE SET level = 'dept_lead', core_requested = false
        `;
      }
      // Fill head/co_head slots idempotently; bulk may exceed 2 slots — fill greedily.
      for (const uid of ids) {
        await tx`
          UPDATE departments
          SET head_user_id = CASE WHEN head_user_id IS NULL THEN ${uid} ELSE head_user_id END,
              co_head_user_id = CASE WHEN head_user_id IS NOT NULL AND head_user_id <> ${uid} AND co_head_user_id IS NULL THEN ${uid} ELSE co_head_user_id END
          WHERE id = ${departmentId}
        `;
      }
    }

    const roleLabel = ({ student: "Student", core: "Core Member", dept_lead: "Department Head", vertical_lead: "Vertical Lead", admin: "Super Admin" }[body.role] || body.role);
    for (const uid of ids) {
      try {
        await notify({
          sql: tx,
          tenantId: tenant?.id,
          userId: uid,
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
      action: "bulk_role_assign",
      resource: "profile",
      resourceId: `${ids.length}-users`,
      after: { role: body.role, vertical: body.role === "vertical_lead" ? body.vertical : null, departmentId, userIds: ids },
    });
    return ids;
  });

  return ok({ updated: updatedIds.length });
}
