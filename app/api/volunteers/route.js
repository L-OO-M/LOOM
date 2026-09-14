import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const createSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(3).max(160),
  capacity: z.number().int().min(1).max(10000).default(10)
});

// Volunteer slots: any authenticated member can read (optionally ?eventId=);
// dept leads (of the event's department), vertical leads, and admins can open.
export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  const tid = tenant?.id ?? null;
  if (eventId && !/^[0-9a-f-]{36}$/i.test(eventId)) {
    return fail("VALIDATION_ERROR", "eventId must be a UUID", 400);
  }
  const slots = await sql`
    SELECT s.*, e.title AS event_title, e.department_id,
      (SELECT COUNT(*)::int FROM volunteer_signups v WHERE v.slot_id = s.id) AS signup_count,
      EXISTS (SELECT 1 FROM volunteer_signups v WHERE v.slot_id = s.id AND v.user_id = ${user.id}) AS signed_up
    FROM volunteer_slots s
    JOIN events e ON e.id = s.event_id
    WHERE (s.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND (${eventId ? sql`s.event_id = ${eventId}` : sql`TRUE`})
    ORDER BY s.created_at ASC
  `;
  return ok({ slots: slots.map((s) => ({ ...s, seats_left: Math.max(0, (s.capacity ?? 0) - (s.signup_count ?? 0)) })) });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const tid = tenant?.id ?? null;
  const [event] = await sql`
    SELECT * FROM events WHERE id = ${body.eventId}
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) LIMIT 1
  `;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);

  const admin = isAdmin({ role: profile.role });
  const myLevel = event.department_id
    ? (profile.memberships || []).find((m) => m.department_id === event.department_id)?.level
    : null;
  if (!admin && profile.role !== "vertical_lead" && myLevel !== "dept_lead") {
    return fail("FORBIDDEN", "Only the event's department leads (or vertical leads / admins) can open volunteer slots", 403);
  }
  const [slot] = await sql`
    INSERT INTO volunteer_slots (tenant_id, event_id, title, capacity, created_by)
    VALUES (${tid}, ${body.eventId}, ${body.title}, ${body.capacity}, ${user.id})
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "created_volunteer_slot",
    resource: "volunteer_slot", resourceId: slot.id,
    after: { eventId: body.eventId, title: body.title, capacity: body.capacity }
  });
  return ok({ slot }, { status: 201 });
}
