import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { handoverScope, findCandidate } from "@/lib/handover";

const briefPatchSchema = z.object({
  summary: z.string().max(2000).optional(),
  responsibilities: z.string().max(4000).optional(),
  activeWork: z.string().max(4000).optional(),
  risks: z.string().max(4000).optional(),
  contacts: z.string().max(2000).optional()
});

const patchSchema = z.object({
  action: z.enum(["save", "submit", "cancel"]),
  toUserId: z.string().min(1).max(64).optional(),
  brief: briefPatchSchema.optional(),
  transferPlanner: z.boolean().optional(),
  transferEventOps: z.boolean().optional(),
  transferHeadSlot: z.boolean().optional()
});

function gap(brief) {
  return String(brief?.summary || "").trim().length < 20 || String(brief?.responsibilities || "").trim().length < 20;
}

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail("FORBIDDEN", "Leader profile required", 403);
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  if (!can(profile, "manage_handover").ok) return fail("FORBIDDEN", "Leads only", 403);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const { id } = await params;
  const [existing] = await sql`
    SELECT * FROM lead_handovers
    WHERE id = ${id} AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!existing) return fail("NOT_FOUND", "Handover not found", 404);
  if (existing.from_user_id !== user.id) return fail("FORBIDDEN", "Only the outgoing lead can edit this handover", 403);
  if (existing.status === "completed") return fail("CONFLICT", "This handover is already complete", 409);
  if (existing.status === "cancelled") return fail("CONFLICT", "This handover was cancelled", 409);
  if (existing.status === "submitted" && body.action !== "cancel") {
    return fail("CONFLICT", "This handover is waiting for an admin. Cancel it if you need to change it.", 409);
  }

  if (body.action === "cancel") {
    const [handover] = await sql`
      UPDATE lead_handovers
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${tenant.id}::uuid AND from_user_id = ${user.id}
      RETURNING *
    `;
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant.id, action: "cancelled_handover",
      resource: "lead_handover", resourceId: id, before: { status: existing.status }
    });
    return ok({ handover });
  }

  const scope = handoverScope(profile);
  if (scope.error) return fail("VALIDATION_ERROR", scope.error, 400);
  if (scope.role !== existing.role
    || (scope.departmentId ?? null) !== (existing.department_id ?? null)
    || (scope.vertical ?? null) !== (existing.vertical ?? null)) {
    return fail("CONFLICT", "Your seat changed since this draft was created. File a new handover.", 409);
  }

  const toUserId = body.toUserId || existing.to_user_id;
  if (toUserId === user.id) return fail("VALIDATION_ERROR", "Pick a different successor", 400);
  const candidate = await findCandidate(sql, {
    tenantId: tenant.id,
    scope,
    fromUserId: user.id,
    toUserId
  });
  if (!candidate) return fail("VALIDATION_ERROR", "The successor must be a core member or lead in your scope", 400);

  const brief = { ...(existing.brief || {}), ...(body.brief || {}) };
  if (body.action === "submit" && gap(brief)) {
    return fail("VALIDATION_ERROR", "Before submitting, explain what the role owns and what is in flight (20 characters each).", 400);
  }

  const nextStatus = body.action === "submit" ? "submitted" : "draft";
  const [handover] = await sql`
    UPDATE lead_handovers
    SET to_user_id = ${toUserId},
        brief = ${sql.json(brief)},
        transfer_planner = ${body.transferPlanner ?? existing.transfer_planner},
        transfer_event_ops = ${body.transferEventOps ?? existing.transfer_event_ops},
        transfer_head_slot = ${body.transferHeadSlot ?? existing.transfer_head_slot},
        status = ${nextStatus},
        submitted_at = ${body.action === "submit" ? sql`NOW()` : existing.submitted_at},
        review_note = CASE WHEN ${body.action === "submit"} THEN '' ELSE review_note END,
        updated_at = NOW()
    WHERE id = ${id} AND tenant_id = ${tenant.id}::uuid AND from_user_id = ${user.id}
    RETURNING *
  `;

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: body.action === "submit" ? "submitted_handover" : "updated_handover",
    resource: "lead_handover",
    resourceId: id,
    before: { status: existing.status, to: existing.to_user_id },
    after: { status: handover.status, to: handover.to_user_id }
  });

  return ok({ handover });
}
