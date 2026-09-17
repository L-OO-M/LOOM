import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { validateBooking, toScheduledAt, priceFor, bookedTimesFor } from "@/lib/mentors";

const bookSchema = z.object({
  duration: z.number().int().refine((n) => [30, 60].includes(n), "Invalid session length"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  topic: z.string().max(200).optional().default(""),
  message: z.string().max(1000).optional().default(""),
});

// Book a session. Guards: mentor exists + available + tenant-scoped,
// slot still free (double-booking safe), date not in the past.
export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = bookSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [mentor] = await sql`
    SELECT * FROM mentors
    WHERE (user_id = ${id} OR id::text = ${id})
      AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    LIMIT 1
  `;
  if (!mentor) return fail("NOT_FOUND", "Mentor not found", 404);
  if (user.id === mentor.user_id) return fail("INVALID", "You cannot book yourself", 400);
  const booked = await bookedTimesFor(sql, mentor.user_id, body.date);
  const check = validateBooking({ mentor, dateIso: body.date, time: body.time, duration: body.duration, bookedTimes: booked });
  if (!check.ok) return fail("INVALID", check.error, 400);
  const scheduledAt = toScheduledAt(body.date, body.time);
  const [session] = await sql`
    INSERT INTO mentor_sessions (mentor_id, student_id, status, scheduled_at, topic, message, duration_minutes, price)
    VALUES (${mentor.user_id}, ${user.id}, 'requested', ${scheduledAt}::timestamptz,
      ${body.topic}, ${body.message}, ${body.duration}, ${priceFor(mentor.hourly_rate, body.duration)})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "booked_mentorship", resource: "mentor_session", resourceId: session.id, after: { mentor: mentor.user_id, scheduledAt } });
  await notify({ sql, tenantId: tenant?.id, userId: mentor.user_id, type: "mentorship", title: "New session request", body: body.topic || "A student requested a session", link: "/student/mentorship/manage" });
  return ok({ session }, { status: 201 });
}
