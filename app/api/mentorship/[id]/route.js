import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  status: z.enum(["scheduled", "completed", "cancelled"]),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional()
});

// Allowed transitions per participant. A mentor accepts a request, either side
// can reschedule while it is live, either side can cancel before it runs, and
// only the mentor can mark it completed.
const MENTOR_TRANSITIONS = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["scheduled", "completed", "cancelled"],
  completed: [],
  cancelled: []
};

const STUDENT_TRANSITIONS = {
  requested: ["cancelled"],
  scheduled: ["scheduled", "cancelled"],
  completed: [],
  cancelled: []
};

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const { id } = await params;
  if (!UUID.test(String(id))) return fail("INVALID_ID", "Invalid session id", 400);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  // The session table has no tenant column, so scope through the mentor's
  // profile. Participant identity alone would let a stale cross-chapter session
  // id be mutated after a move; the tenant predicate fails closed instead.
  const [session] = await sql`
    SELECT s.*, mp.name AS mentor_name, sp.name AS student_name
    FROM mentor_sessions s
    JOIN profiles mp ON mp.user_id = s.mentor_id AND mp.tenant_id = ${tenant.id}::uuid
    LEFT JOIN profiles sp ON sp.user_id = s.student_id
    WHERE s.id = ${id}::uuid
      AND (s.student_id = ${user.id} OR s.mentor_id = ${user.id})
      LIMIT 1
  `;
  if (!session) return fail("NOT_FOUND", "Session not found", 404);

  const isMentor = session.mentor_id === user.id;
  const allowed = (isMentor ? MENTOR_TRANSITIONS : STUDENT_TRANSITIONS)[session.status] || [];
  if (!allowed.includes(body.status)) {
    return fail(
      "INVALID_TRANSITION",
      `A ${session.status} session cannot become ${body.status}`,
      409
    );
  }

  // "scheduled" means two different things depending on the current state:
  // accepting a request, or rescheduling a live session. A reschedule must say
  // when; otherwise the button would silently keep the old time.
  const rescheduling = body.status === "scheduled" && session.status === "scheduled";
  if (rescheduling && !body.scheduledAt) {
    return fail("SCHEDULED_AT_REQUIRED", "Choose a new date and time", 400);
  }

  const nextScheduledAt = body.status === "scheduled"
    ? (body.scheduledAt || session.scheduled_at || new Date().toISOString())
    : session.scheduled_at;

  const [updated] = await sql`
    UPDATE mentor_sessions
    SET status = ${body.status},
        scheduled_at = ${nextScheduledAt}::timestamptz
    WHERE id = ${session.id}
    RETURNING *
  `;

  const counterpartId = isMentor ? session.student_id : session.mentor_id;
  const counterpartName = isMentor ? session.student_name : session.mentor_name;
  const label = {
    scheduled: rescheduling ? "rescheduled" : "accepted",
    completed: "completed",
    cancelled: "cancelled"
  }[body.status];

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: `mentorship_${label}`,
    resource: "mentor_session",
    resourceId: session.id,
    after: { status: body.status }
  });
  await notify({
    sql,
    tenantId: tenant.id,
    userId: counterpartId,
    type: "mentorship",
    title: `Session ${label}: ${counterpartName || "Mentorship"}`,
    body: body.status === "completed"
      ? "The session is on record. Consider leaving a review."
      : "Open mentorship to see the updated request.",
    link: "/student/mentorship"
  });

  return ok({ session: updated });
}
