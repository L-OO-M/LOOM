import { scope } from "@/lib/tenant-scope";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const proposeSchema = z.object({
  headId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  amount: z.number().positive().max(100000000),
  note: z.string().min(3).max(1000)
});

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "paid"])
});

// Expenses: dept leads, vertical leads, and admins can propose; only admins
// decide (vertical leads are recommend_only per the permissions matrix).
export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  let body;
  try {
    body = proposeSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const admin = isAdmin({ role: profile.role });
  const isLead = (profile.memberships || []).some((m) => m.level === "dept_lead");
  if (!admin && profile.role !== "vertical_lead" && !isLead) {
    return fail("FORBIDDEN", "Only department leads and above can propose expenses", 403);
  }
  const tid = tenant?.id ?? null;
  let head = null;
  if (body.headId) {
    [head] = await sql`
      SELECT id, vertical, department_id FROM budget_heads WHERE id = ${body.headId}
        AND tenant_id = ${scope(tid)}::uuid LIMIT 1
    `;
    if (!head) return fail("NOT_FOUND", "Budget head not found", 404);
  }
  let dept = null;
  if (body.departmentId) {
    [dept] = await sql`
      SELECT id, vertical FROM departments WHERE id = ${body.departmentId}
        AND tenant_id = ${scope(tid)}::uuid LIMIT 1
    `;
    if (!dept) return fail("NOT_FOUND", "Department not found", 404);
  }

  // The expense charges a head; that head's department (or the named
  // department when the head is society-wide) must be one the proposer holds.
  // A dept lead can never charge another department's budget by naming their
  // own department alongside a foreign head.
  const targetDepartmentId = head?.department_id || body.departmentId || null;
  if (head?.department_id && body.departmentId && head.department_id !== body.departmentId) {
    return fail("FORBIDDEN", "That budget head belongs to a different department", 403);
  }
  if (!admin) {
    if (!targetDepartmentId) {
      return fail("FORBIDDEN", "Choose a budget head or department you lead", 403);
    }
    if (profile.role === "vertical_lead") {
      const target = dept?.id === targetDepartmentId
        ? dept
        : (await sql`
            SELECT id, vertical FROM departments
            WHERE id = ${targetDepartmentId} AND tenant_id = ${scope(tid)}::uuid
            LIMIT 1
          `)[0];
      if (!target || target.vertical !== profile.vertical) {
        return fail("FORBIDDEN", "You can only propose expenses for departments in your vertical", 403);
      }
      if (head?.vertical && head.vertical !== profile.vertical) {
        return fail("FORBIDDEN", "That budget head belongs to another vertical", 403);
      }
    } else {
      const leadsDept = (profile.memberships || []).some(
        (m) => m.department_id === targetDepartmentId && m.level === "dept_lead"
      );
      if (!leadsDept) {
        return fail("FORBIDDEN", "You can only propose expenses against a budget you lead", 403);
      }
      if (head?.vertical) {
        const target = dept?.id === targetDepartmentId
          ? dept
          : (await sql`
              SELECT id, vertical FROM departments
              WHERE id = ${targetDepartmentId} AND tenant_id = ${scope(tid)}::uuid
              LIMIT 1
            `)[0];
        if (target && head.vertical !== target.vertical) {
          return fail("FORBIDDEN", "That budget head belongs to another vertical", 403);
        }
      }
    }
  }
  const [expense] = await sql`
    INSERT INTO expenses (tenant_id, head_id, department_id, amount, note, status, created_by)
    VALUES (${tid}, ${body.headId || null}, ${targetDepartmentId}, ${body.amount}, ${body.note}, 'proposed', ${user.id})
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "proposed_expense",
    resource: "expense", resourceId: expense.id, after: { amount: body.amount, note: body.note }
  });
  return ok({ expense }, { status: 201 });
}

export async function PATCH(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!isAdmin({ role: profile.role })) {
    return fail("FORBIDDEN", "Only admins can approve or reject expenses — vertical leads may recommend", 403);
  }
  let body;
  try {
    body = decideSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const tid = tenant?.id ?? null;
  const [expense] = body.decision === "paid"
    ? await sql`
        UPDATE expenses
        SET status = 'paid', paid_at = now(), paid_by = ${user.id}
        WHERE id = ${body.id} AND status = 'approved'
          AND tenant_id = ${scope(tid)}::uuid
        RETURNING *
      `
    : await sql`
        UPDATE expenses SET status = ${body.decision}, decided_by = ${user.id}
        WHERE id = ${body.id} AND status = 'proposed'
          AND tenant_id = ${scope(tid)}::uuid
        RETURNING *
      `;
  if (!expense) {
    return fail(
      "NOT_FOUND",
      body.decision === "paid" ? "No approved expense with that id" : "No proposed expense with that id",
      404
    );
  }
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: `expense_${body.decision}`,
    resource: "expense", resourceId: body.id, after: { decision: body.decision }
  });
  return ok({ expense });
}
