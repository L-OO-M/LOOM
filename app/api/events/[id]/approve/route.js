import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { hasVerticalLeadGrant, isAdmin } from "@/lib/permissions";
import { decideEventTransition } from "@/lib/event-transitions";

const schema = z.object({
  approve: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
  lockVersion: z.number().int().positive().optional()
});

// Resolve the approval queue through the canonical FSM. Approval preserves two
// explicit facts (approved, then published) instead of collapsing governance
// and publication into one unaudited UPDATE.
export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const admin = isAdmin({ role: profile.role });
  const [event] = await sql`
    SELECT * FROM events
    WHERE id = ${id} AND tenant_id = ${tenant.id}::uuid
      AND status IN ('submitted', 'under_review')
    LIMIT 1
  `;
  if (!event) return fail("NOT_FOUND", "No submitted event found", 404);
  if (event.created_by === user.id) {
    return fail("SELF_APPROVAL_BLOCKED", "You cannot approve your own event", 403);
  }
  if (body.lockVersion !== undefined && event.lock_version !== body.lockVersion) {
    return fail("CONCURRENCY_CONFLICT", "Event was changed by another user", 409);
  }

  let eventVertical = null;
  if (event.department_id) {
    const [department] = await sql`
      SELECT vertical FROM departments
      WHERE id = ${event.department_id} AND tenant_id = ${tenant.id}::uuid LIMIT 1
    `;
    eventVertical = department?.vertical ?? null;
  } else if (event.created_by) {
    const [department] = await sql`
      SELECT d.vertical
      FROM department_memberships m
      JOIN departments d ON d.id = m.department_id
      WHERE m.user_id = ${event.created_by}
        AND m.tenant_id = ${tenant.id}::uuid
      ORDER BY CASE WHEN m.level = 'dept_lead' THEN 0 ELSE 1 END
      LIMIT 1
    `;
    eventVertical = department?.vertical ?? null;
  }
  const verticalLead = profile.role === "vertical_lead" && !!eventVertical && hasVerticalLeadGrant({
    id: user.id,
    tenantId: tenant.id,
    scopedGrants: profile.scopedGrants || []
  }, eventVertical);
  if (!admin && !verticalLead) {
    return fail("FORBIDDEN", "Only an authorized Vertical Lead or Admin can review this event", 403);
  }

  const firstTarget = body.approve ? "approved" : "rejected";
  const first = decideEventTransition({
    event,
    targetStatus: firstTarget,
    actorId: user.id,
    actorRole: profile.role,
    isVerticalLead: verticalLead,
    isAdmin: admin,
    expectedVersion: event.lock_version
  });
  if (!first.ok) return fail(first.reason, "That event transition is not allowed", first.reason === "FORBIDDEN" ? 403 : 422);

  let finalStatus = first.patch.status;
  if (body.approve) {
    const publish = decideEventTransition({
      event: { ...event, status: "approved" },
      targetStatus: "published",
      actorId: user.id,
      actorRole: profile.role,
      isVerticalLead: verticalLead,
      isAdmin: admin
    });
    if (!publish.ok) return fail(publish.reason, "The approved event could not be published", 422);
    finalStatus = publish.patch.status;
  }

  const result = await sql.begin(async (tx) => {
    const [updated] = await tx`
      UPDATE events SET status = ${finalStatus}, lock_version = lock_version + 1
      WHERE id = ${id} AND tenant_id = ${tenant.id}::uuid
        AND lock_version = ${event.lock_version}
      RETURNING *
    `;
    if (!updated) return null;
    await tx`
      INSERT INTO event_status_history (
        tenant_id, event_id, previous_status, new_status, performed_by, reason
      ) VALUES (
        ${tenant.id}::uuid, ${id}, ${event.status}, ${firstTarget}, ${user.id}, ${body.reason || null}
      )
    `;
    if (body.approve) {
      await tx`
        INSERT INTO event_status_history (
          tenant_id, event_id, previous_status, new_status, performed_by, reason
        ) VALUES (
          ${tenant.id}::uuid, ${id}, 'approved', 'published', ${user.id}, 'Published after approval'
        )
      `;
    }
    return updated;
  });
  if (!result) return fail("CONCURRENCY_CONFLICT", "Event was changed by another user", 409);

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: body.approve ? "approved_event" : "rejected_event",
    resource: "event",
    resourceId: id,
    before: { status: event.status, lockVersion: event.lock_version },
    after: { status: finalStatus, reason: body.reason || null }
  });
  if (event.created_by) {
    await notify({
      sql,
      tenantId: tenant.id,
      userId: event.created_by,
      type: body.approve ? "event_approved" : "event_rejected",
      title: body.approve ? `Approved: ${event.title}` : `Not approved: ${event.title}`,
      body: body.approve ? "Your society event is on the calendar." : (body.reason || "A reviewer returned the event."),
      link: "/student/events"
    });
  }
  return ok({ event: result });
}
