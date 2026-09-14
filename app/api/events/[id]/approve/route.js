import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const schema = z.object({ approve: z.boolean() });

// Resolve the approval queue: a Vertical Lead (own vertical's orbit) or a
// Super Admin publishes a proposed society event or sends it back.
export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = schema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const admin = isAdmin({ role: profile.role });
  const verticalLead = profile.role === "vertical_lead";
  if (!admin && !verticalLead) return fail("FORBIDDEN", "Only Vertical Leads and Super Admins approve events", 403);

  const [event] = await sql`
    SELECT * FROM events WHERE id = ${id}
      AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      AND status = 'proposed' LIMIT 1
  `;
  if (!event) return fail("NOT_FOUND", "No proposed event found", 404);

  const [updated] = await sql`
    UPDATE events SET status = ${body.approve ? "upcoming" : "cancelled"} WHERE id = ${id} RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: body.approve ? "approved_event" : "rejected_event",
    resource: "event", resourceId: id, after: { title: event.title }
  });
  if (event.created_by && event.created_by !== user.id) {
    await notify({
      sql, tenantId: tenant?.id, userId: event.created_by, type: body.approve ? "event_approved" : "event_rejected",
      title: body.approve ? `Approved: ${event.title}` : `Not approved: ${event.title}`,
      body: body.approve ? "Your society event is on the calendar." : "A lead sent it back — check with your Vertical Lead.",
      link: "/student/events"
    });
  }
  return ok({ event: updated });
}
