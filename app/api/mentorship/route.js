import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const mentors = await sql`
    SELECT m.*, p.name as mentor_name FROM mentors m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE (m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) AND m.available = true
    ORDER BY m.created_at DESC LIMIT 50
  `;
  const sessions = await sql`
    SELECT * FROM mentor_sessions WHERE student_id = ${user.id} OR mentor_id = ${user.id}
    ORDER BY scheduled_at NULLS LAST, id DESC LIMIT 20
  `;
  return ok({ mentors, sessions });
}

const requestSchema = z.object({
  mentorId: z.string().min(1),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable()
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = requestSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.mentorId);
  const [mentor] = isUuid
    ? await sql`SELECT * FROM mentors WHERE user_id = ${body.mentorId} OR id = ${body.mentorId}::uuid LIMIT 1`
    : await sql`SELECT * FROM mentors WHERE user_id = ${body.mentorId} LIMIT 1`;
  if (!mentor) return fail("NOT_FOUND", "Mentor not found", 404);
  const mentorUserId = mentor.user_id;
  const [session] = await sql`
    INSERT INTO mentor_sessions (mentor_id, student_id, status, scheduled_at)
    VALUES (${mentorUserId}, ${user.id}, 'requested', ${body.scheduledAt || null})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "requested_mentorship", resource: "mentor_session", resourceId: session.id, after: { mentor: mentorUserId } });
  await notify({ sql, tenantId: tenant?.id, userId: mentorUserId, type: "mentorship", title: "New session request", link: "/admin/mentors" });
  return ok({ session }, { status: 201 });
}
