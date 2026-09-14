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
  decision: z.enum(["approved", "rejected"])
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
  if (body.headId) {
    const [head] = await sql`
      SELECT id FROM budget_heads WHERE id = ${body.headId}
        AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) LIMIT 1
    `;
    if (!head) return fail("NOT_FOUND", "Budget head not found", 404);
  }
  if (body.departmentId) {
    const [dept] = await sql`
      SELECT id FROM departments WHERE id = ${body.departmentId}
        AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) LIMIT 1
    `;
    if (!dept) return fail("NOT_FOUND", "Department not found", 404);
  }
  const [expense] = await sql`
    INSERT INTO expenses (tenant_id, head_id, department_id, amount, note, status, created_by)
    VALUES (${tid}, ${body.headId || null}, ${body.departmentId || null}, ${body.amount}, ${body.note}, 'proposed', ${user.id})
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
  const [expense] = await sql`
    UPDATE expenses SET status = ${body.decision}, decided_by = ${user.id}
    WHERE id = ${body.id} AND status = 'proposed'
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    RETURNING *
  `;
  if (!expense) return fail("NOT_FOUND", "No proposed expense with that id", 404);
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: `expense_${body.decision}`,
    resource: "expense", resourceId: body.id, after: { decision: body.decision }
  });
  return ok({ expense });
}
