import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, notify, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";

const registerSchema = z.object({
  action: z.enum(["register", "cancel"]).default("register"),
  feedbackScore: z.number().int().min(1).max(5).nullable().optional(),
  feedbackText: z.string().max(1000).nullable().optional()
});

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  const [event] = await sql`
    SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken
    FROM events e WHERE e.id = ${id} AND e.tenant_id = ${tenant?.id ?? null}::uuid LIMIT 1
  `;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);
  const [mine] = await sql`SELECT * FROM event_registrations WHERE event_id = ${id} AND student_id = ${user.id} LIMIT 1`;
  const materials = await sql`SELECT * FROM event_materials WHERE event_id = ${id} ORDER BY uploaded_at ASC`;
  let attendees = [];
  if (profile?.role === "admin") {
    attendees = await sql`
      SELECT r.*, p.name AS student_name FROM event_registrations r
      LEFT JOIN profiles p ON p.user_id = r.student_id
      WHERE r.event_id = ${id} ORDER BY r.registered_at ASC LIMIT 200
    `;
  }
  return ok({ event, mine: mine || null, materials, attendees });
}

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = registerSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const limited = checkRateLimit(`event-register:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many registration attempts — slow down", 429);
  const tid = tenant?.id ?? null;

  if (body.action === "cancel") {
    const result = await sql.begin(async (tx) => {
      const [event] = await tx`
        SELECT * FROM events WHERE id = ${id} AND tenant_id = ${tid}::uuid
          AND status IN ('upcoming', 'live', 'past') LIMIT 1 FOR UPDATE
      `;
      if (!event) return { kind: "NOT_FOUND" };
      const [cancelled] = await tx`UPDATE event_registrations SET status = 'cancelled' WHERE event_id = ${id} AND student_id = ${user.id} AND status <> 'cancelled' RETURNING id`;
      if (!cancelled) return { kind: "ALREADY", event };
      await tx`UPDATE events SET registered_count = (SELECT COUNT(*) FROM event_registrations WHERE event_id = ${id} AND status <> 'cancelled') WHERE id = ${id} AND tenant_id = ${tid}::uuid`;
      return { kind: "CANCELLED", event };
    });
    if (result.kind === "NOT_FOUND") return fail("NOT_FOUND", "Event not found", 404);
    if (result.kind === "ALREADY") return ok({ cancelled: false, already: true });
    await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "cancelled_registration", resource: "event", resourceId: id, after: { status: "cancelled" } });
    return ok({ cancelled: true });
  }

  const result = await sql.begin(async (tx) => {
    const [event] = await tx`
      SELECT * FROM events WHERE id = ${id} AND tenant_id = ${tid}::uuid
        AND status IN ('upcoming', 'live', 'past') LIMIT 1 FOR UPDATE
    `;
    if (!event) return { kind: "NOT_FOUND" };

    const [{ seats = 0 }] = await tx`SELECT COUNT(*)::int AS seats FROM event_registrations WHERE event_id = ${id} AND status <> 'cancelled'`;
    const [mine] = await tx`SELECT id FROM event_registrations WHERE event_id = ${id} AND student_id = ${user.id} AND status <> 'cancelled' LIMIT 1`;
    if (mine) return { kind: "ALREADY", event };
    if (event.capacity && seats >= event.capacity) return { kind: "FULL", event };

    const code = `LOOM-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const [row] = await tx`
      INSERT INTO event_registrations (event_id, student_id, status, check_in_code)
      VALUES (${id}, ${user.id}, 'registered', ${code})
      ON CONFLICT (event_id, student_id) DO UPDATE SET status = 'registered' RETURNING *
    `;
    await tx`UPDATE events SET registered_count = (SELECT COUNT(*) FROM event_registrations WHERE event_id = ${id} AND status <> 'cancelled') WHERE id = ${id} AND tenant_id = ${tid}::uuid`;
    return { kind: "REGISTERED", event, row };
  });
  if (result.kind === "NOT_FOUND") return fail("NOT_FOUND", "Event not found", 404);
  if (result.kind === "FULL") return fail("EVENT_FULL", "This event is full", 409);
  if (result.kind === "ALREADY") return ok({ already: true });

  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "registered_event", resource: "event", resourceId: id, after: { status: "registered" } });
  await notify({
    sql, tenantId: tenant?.id, userId: user.id, type: "event_registered",
    title: `Registered: ${result.event.title}`,
    body: `Show this check-in code at the door: ${result.row.check_in_code}.`,
    link: `/student/events/${id}`
  });
  return ok({ registration: result.row }, { status: 201 });
}

// Attendees submit feedback after attending.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = registerSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (!body.feedbackScore && !body.feedbackText) return fail("VALIDATION_ERROR", "Feedback is empty", 400);
  // Feedback is post-attendance only: the event must belong to the student's
  // tenant and the student must hold an attended registration for it.
  const [visible] = await sql`SELECT id FROM events WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid LIMIT 1`;
  if (!visible) return fail("NOT_FOUND", "Registration not found", 404);
  const [row] = await sql`
    UPDATE event_registrations SET feedback_score = COALESCE(${body.feedbackScore ?? null}, feedback_score),
      feedback_text = COALESCE(${body.feedbackText ?? null}, feedback_text)
    WHERE event_id = ${id} AND student_id = ${user.id} AND status = 'attended' RETURNING *
  `;
  if (!row) return fail("NOT_FOUND", "Registration not found", 404);
  return ok({ registration: row });
}
