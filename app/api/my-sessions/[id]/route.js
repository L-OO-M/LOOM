import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { bookedTimesFor } from "@/lib/mentors";

const patchSchema = z.object({
  action: z.enum(["cancel", "reschedule", "review"]),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  text: z.string().max(1000).optional().default(""),
});

// Student owns the row: cancel upcoming, reschedule to a free slot,
// or review a completed session (one review per mentor, latest wins).
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [session] = await sql`
    SELECT * FROM mentor_sessions WHERE id = ${id} AND student_id = ${user.id} LIMIT 1
  `;
  if (!session) return fail("NOT_FOUND", "Session not found", 404);

  if (body.action === "cancel") {
    if (!["requested", "scheduled"].includes(session.status)) {
      return fail("INVALID", "Only upcoming sessions can be cancelled", 400);
    }
    const [updated] = await sql`
      UPDATE mentor_sessions SET status = 'cancelled' WHERE id = ${id} RETURNING *
    `;
    await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "cancelled_mentorship", resource: "mentor_session", resourceId: id });
    await notify({ sql, tenantId: tenant?.id, userId: session.mentor_id, type: "mentorship", title: "Session cancelled", link: "/student/mentorship/manage" });
    return ok({ session: updated });
  }

  if (body.action === "reschedule") {
    if (!["requested", "scheduled"].includes(session.status)) {
      return fail("INVALID", "Only upcoming sessions can be rescheduled", 400);
    }
    if (!body.scheduledAt || Number.isNaN(new Date(body.scheduledAt).getTime()) || new Date(body.scheduledAt) < new Date()) {
      return fail("INVALID", "Choose a future date and time", 400);
    }
    const dateIso = new Date(body.scheduledAt).toISOString().slice(0, 10);
    const time = new Date(body.scheduledAt).toISOString().slice(11, 16);
    const booked = (await bookedTimesFor(sql, session.mentor_id, dateIso)).filter((t) => t !== (session.scheduled_at ? new Date(session.scheduled_at).toISOString().slice(11, 16) : null));
    if (booked.includes(time)) return fail("INVALID", "That slot is already taken", 400);
    const [updated] = await sql`
      UPDATE mentor_sessions SET scheduled_at = ${body.scheduledAt}::timestamptz, status = 'requested'
      WHERE id = ${id} RETURNING *
    `;
    await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "rescheduled_mentorship", resource: "mentor_session", resourceId: id, after: { scheduledAt: body.scheduledAt } });
    await notify({ sql, tenantId: tenant?.id, userId: session.mentor_id, type: "mentorship", title: "Session rescheduled", link: "/student/mentorship/manage" });
    return ok({ session: updated });
  }

  // review
  if (session.status !== "completed") return fail("NOT_ELIGIBLE", "Reviews open after a completed session", 403);
  if (!body.rating) return fail("INVALID", "Rating is required", 400);
  const [review] = await sql`
    INSERT INTO mentor_reviews (mentor_id, reviewer_id, rating, review_text, session_id)
    VALUES (${session.mentor_id}, ${user.id}, ${body.rating}, ${body.text}, ${session.id})
    ON CONFLICT (mentor_id, reviewer_id)
    DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text, session_id = EXCLUDED.session_id, reviewed_at = NOW()
    RETURNING *
  `;
  await notify({ sql, tenantId: tenant?.id, userId: session.mentor_id, type: "mentorship", title: "New review received", body: `${body.rating}★ from a mentee`, link: "/student/mentorship/manage" });
  return ok({ review });
}
