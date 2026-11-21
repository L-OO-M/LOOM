import { scope } from "@/lib/tenant-scope";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { hasAnyActiveScopedGrant, hasVerticalLeadGrant, isAdmin, termExpired } from "@/lib/permissions";
import {
  approvalRequirement,
  createApprovalRequest,
  decideApproval,
  finalizeApprovalResource
} from "@/lib/approvals";
import { expenseExpenditureGroupKey } from "@/lib/finance-controls";

const proposeSchema = z.object({
  headId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  amount: z.number().positive().max(100000000),
  note: z.string().min(3).max(1000)
});

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "paid"]),
  reason: z.string().min(3).max(1000).nullable().optional()
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
  const isLead = (profile.memberships || []).some((membership) =>
    membership.level === "dept_lead" && !termExpired(membership.term_end)
  );
  const scopedVerticalLead = profile.role === "vertical_lead" && hasAnyActiveScopedGrant({
    id: user.id,
    tenantId: tenant?.id,
    scopedGrants: profile.scopedGrants || []
  }, "vertical_lead", "vertical");
  if (!admin && !scopedVerticalLead && !isLead) {
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
    if (scopedVerticalLead) {
      const target = dept?.id === targetDepartmentId
        ? dept
        : (await sql`
            SELECT id, vertical FROM departments
            WHERE id = ${targetDepartmentId} AND tenant_id = ${scope(tid)}::uuid
            LIMIT 1
          `)[0];
      const grantUser = {
        id: user.id,
        tenantId: tid,
        scopedGrants: profile.scopedGrants || []
      };
      if (!target || !hasVerticalLeadGrant(grantUser, target.vertical)) {
        return fail("FORBIDDEN", "You can only propose expenses for departments in your vertical", 403);
      }
      if (head?.vertical && !hasVerticalLeadGrant(grantUser, head.vertical)) {
        return fail("FORBIDDEN", "That budget head belongs to another vertical", 403);
      }
    } else {
      const leadsDept = (profile.memberships || []).some(
        (membership) =>
          membership.department_id === targetDepartmentId &&
          membership.level === "dept_lead" &&
          !termExpired(membership.term_end)
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
  const groupKey = expenseExpenditureGroupKey({
    tenantId: tid,
    actorId: user.id,
    departmentId: targetDepartmentId,
    headId: body.headId || null
  });
  const created = await sql.begin(async (tx) => {
    // Serialize same-proposer/same-purpose submissions so splitting cannot race
    // below the dual-approval threshold.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${groupKey}, 0))`;
    const [recent = { recent_total: 0 }] = await tx`
      SELECT COALESCE(SUM(amount), 0)::numeric AS recent_total
      FROM expenses
      WHERE tenant_id = ${tid}::uuid
        AND created_by = ${user.id}
        AND expenditure_group_key = ${groupKey}
        AND status IN ('proposed', 'approved', 'paid')
        AND created_at >= now() - interval '24 hours'
    `;
    const aggregateAmount = Number(recent.recent_total || 0) + body.amount;
    const requirement = approvalRequirement(tenant?.settings, {
      resourceType: "expense",
      amount: aggregateAmount
    });
    const [expense] = await tx`
      INSERT INTO expenses (
        tenant_id, head_id, department_id, amount, note, status, created_by,
        request_version, expenditure_group_key
      ) VALUES (
        ${tid}, ${body.headId || null}, ${targetDepartmentId}, ${body.amount},
        ${body.note}, 'proposed', ${user.id}, 1, ${groupKey}
      )
      RETURNING *
    `;
    const approval = await createApprovalRequest({
      sql: tx,
      tenantId: tid,
      policyKey: requirement.policyKey,
      resourceType: "expense",
      resourceId: expense.id,
      resourceVersion: expense.request_version,
      requestedBy: user.id,
      requiredApprovals: requirement.requiredApprovals,
      escalationHours: requirement.escalationHours,
      snapshot: {
        proposerId: user.id,
        amount: body.amount,
        aggregateAmount,
        departmentId: targetDepartmentId,
        note: body.note,
        groupKey
      }
    });
    const [linked] = await tx`
      UPDATE expenses SET approval_request_id = ${approval.id}
      WHERE id = ${expense.id} AND tenant_id = ${tid}::uuid
      RETURNING *
    `;
    await tx`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, after, metadata)
      VALUES (
        ${user.id}, ${tid}::uuid, 'proposed_expense', 'expense', ${expense.id}::text,
        ${tx.json({ amount: body.amount, aggregateAmount, approvalRequestId: approval.id })},
        ${tx.json({ tenant_id: tid })}
      )
    `;
    return { expense: linked, approval };
  });
  return ok(created, { status: 201 });
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
  if (body.decision === "paid") {
    const [expense] = await sql`
        UPDATE expenses
        SET status = 'paid', paid_at = now(), paid_by = ${user.id}
        WHERE id = ${body.id} AND status = 'approved'
          AND created_by <> ${user.id}
          AND tenant_id = ${scope(tid)}::uuid
        RETURNING *
      `;
    if (!expense) return fail("NOT_FOUND", "No payable approved expense with that id", 404);
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant?.id, action: "expense_paid",
      resource: "expense", resourceId: body.id, after: { decision: "paid" }
    });
    return ok({ expense });
  }

  const [pending] = await sql`
    SELECT * FROM expenses
    WHERE id = ${body.id} AND tenant_id = ${scope(tid)}::uuid AND status = 'proposed'
    LIMIT 1
  `;
  if (!pending?.approval_request_id) {
    return fail("APPROVAL_REQUIRED", "This expense has no versioned approval request", 409);
  }
  const result = await decideApproval({
    sql,
    tenantId: tid,
    requestId: pending.approval_request_id,
    actorId: user.id,
    actorRole: profile.role,
    decision: body.decision,
    reason: body.reason || null,
    authorizationContext: { source: "finance_expense_api", expenseVersion: pending.request_version },
    onFinal: (tx, { request: approval, status }) => finalizeApprovalResource(tx, {
      request: approval,
      status,
      actorId: user.id
    })
  });
  if (!result.ok) {
    const status = result.reason === "SELF_APPROVAL_BLOCKED" ? 403 : 409;
    return fail(result.reason, result.reason.replaceAll("_", " ").toLowerCase(), status);
  }
  return ok({ expense: result.resource, approval: result.request });
}
