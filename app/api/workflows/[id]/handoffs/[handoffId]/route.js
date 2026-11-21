import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { decideHandoffTransition, validateDepartmentDeliverable } from "@/lib/department-handoffs";

const schema = z.object({
  action: z.enum(["start", "submit", "approve", "return", "block"]),
  deliverable: z.record(z.string(), z.unknown()).optional(),
  reviewNote: z.string().max(1000).nullable().optional()
});

function actor(ctx) {
  return {
    id: ctx.user.id,
    tenantId: ctx.tenant.id,
    role: ctx.profile.role,
    vertical: ctx.profile.vertical || null,
    memberships: ctx.profile.memberships || [],
    scopedGrants: ctx.profile.scopedGrants || []
  };
}

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }
  const { id, handoffId } = await params;
  const { user, tenant, sql } = ctx;
  const [handoff] = await sql`
    SELECT wh.*, d.slug AS department_slug, d.vertical AS department_vertical
    FROM workflow_handoffs wh
    JOIN departments d ON d.id = wh.to_department_id AND d.tenant_id = wh.tenant_id
    WHERE wh.id = ${handoffId}::uuid AND wh.workflow_id = ${id}::uuid
      AND wh.tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!handoff) return fail("NOT_FOUND", "Workflow handoff not found", 404);
  const transition = decideHandoffTransition(handoff.status, body.action);
  if (!transition.ok) {
    return fail(
      "INVALID_TRANSITION",
      `Cannot ${body.action} a handoff while it is ${handoff.status}`,
      409
    );
  }

  const manager = can(actor(ctx), "manage_department_tasks", {
    departmentId: handoff.to_department_id,
    vertical: handoff.department_vertical
  }).ok;
  const assigned = handoff.assigned_owner_id === user.id;
  if (["start", "submit", "block"].includes(body.action) && !manager && !assigned) {
    return fail("FORBIDDEN", "Only the receiving team or assigned owner can update this handoff", 403);
  }
  if (["approve", "return"].includes(body.action)) {
    if (!manager) return fail("FORBIDDEN", "Only an independent receiving-team lead can review", 403);
    if (handoff.submitted_by === user.id) return fail("SELF_APPROVAL_BLOCKED", "You cannot review your own handoff", 403);
  }
  if (body.action === "return" && !body.reviewNote?.trim()) {
    return fail("VALIDATION_ERROR", "Explain what must change", 400);
  }
  if (body.action === "submit") {
    const validation = validateDepartmentDeliverable(handoff.department_slug, body.deliverable || {});
    if (!validation.valid) {
      return fail("DELIVERABLE_INCOMPLETE", `Missing: ${validation.missingFields.join(", ")}`, 400);
    }
    if (handoff.sequence > 1) {
      const [blocked] = await sql`
        SELECT id FROM workflow_handoffs
        WHERE workflow_id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
          AND sequence < ${handoff.sequence}
          AND status <> 'approved'
        LIMIT 1
      `;
      if (blocked) return fail("DEPENDENCY_BLOCKED", "Earlier handoffs must be approved first", 409);
    }
  }

  const nextStatus = transition.nextStatus;
  const result = await sql.begin(async (tx) => {
    const [updated] = await tx`
      UPDATE workflow_handoffs SET
        status = ${nextStatus},
        deliverable = CASE WHEN ${body.action === "submit"} THEN ${tx.json(body.deliverable || {})} ELSE deliverable END,
        submitted_by = CASE WHEN ${body.action === "submit"} THEN ${user.id} ELSE submitted_by END,
        submitted_at = CASE WHEN ${body.action === "submit"} THEN now() ELSE submitted_at END,
        reviewed_by = CASE
          WHEN ${["approve", "return"].includes(body.action)} THEN ${user.id}
          WHEN ${["start", "submit"].includes(body.action)} THEN NULL
          ELSE reviewed_by END,
        reviewed_at = CASE
          WHEN ${["approve", "return"].includes(body.action)} THEN now()
          WHEN ${["start", "submit"].includes(body.action)} THEN NULL
          ELSE reviewed_at END,
        review_note = CASE
          WHEN ${["approve", "return"].includes(body.action)} THEN ${body.reviewNote || null}
          WHEN ${["start", "submit"].includes(body.action)} THEN NULL
          ELSE review_note END,
        updated_at = now()
      WHERE id = ${handoff.id} AND workflow_id = ${id}::uuid
        AND tenant_id = ${tenant.id}::uuid AND status = ${handoff.status}
      RETURNING *
    `;
    if (!updated) return null;
    if (body.action === "approve") {
      await tx`
        UPDATE workflow_handoffs SET status = 'ready', updated_at = now()
        WHERE workflow_id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
          AND sequence = ${handoff.sequence + 1} AND status = 'pending'
      `;
      const [remaining] = await tx`
        SELECT id FROM workflow_handoffs
        WHERE workflow_id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
          AND status <> 'approved'
        LIMIT 1
      `;
      if (!remaining) {
        await tx`
          UPDATE workflow_instances SET status = 'completed', completed_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
        `;
      }
    }
    await tx`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, after, reason, metadata)
      VALUES (
        ${user.id}, ${tenant.id}::uuid, ${`workflow.handoff.${body.action}`},
        'workflow_handoff', ${handoff.id}::text, ${tx.json({ status: nextStatus })},
        ${body.reviewNote || null}, ${tx.json({ tenant_id: tenant.id, workflow_id: id })}
      )
    `;
    return updated;
  });
  if (!result) return fail("CONFLICT", "The handoff changed; reload and try again", 409);
  return ok({ handoff: result });
}
