import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const decisionSchema = z.object({
  decision: z.enum(["accept", "reject", "complete"]),
  meetingUrl: z.string().url().max(500).optional().nullable(),
});

// Mentor accepts (requested -> scheduled), rejects (-> cancelled), or
// marks done (scheduled -> completed). Only the session's mentor may act.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = decisionSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [session] = await sql`
    SELECT * FROM mentor_sessions WHERE id = ${id} AND mentor_id = ${user.id} LIMIT 1
  `;
  if (!session) return fail("NOT_FOUND", "Session not found", 404);

  let status = null;
  if (body.decision === "accept" && session.status === "requested") status = "scheduled";
  if (body.decision === "reject" && session.status === "requested") status = "cancelled";
  if (body.decision === "complete" && session.status === "scheduled") status = "completed";
  if (!status) return fail("INVALID", "That transition is not allowed", 400);

  const [updated] = await sql`
    UPDATE mentor_sessions
    SET status = ${status}, meeting_url = COALESCE(${body.meetingUrl || null}, meeting_url)
    WHERE id = ${id} RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: `mentor_${body.decision}`, resource: "mentor_session", resourceId: id });
  await notify({
    sql, tenantId: tenant?.id, userId: session.student_id, type: "mentorship",
    title: body.decision === "accept" ? "Session accepted" : body.decision === "reject" ? "Session declined" : "Session completed",
    body: body.decision === "accept" ? "Your mentor confirmed the session" : null,
    link: "/student/mentorship/sessions",
  });
  return ok({ session: updated });
}
