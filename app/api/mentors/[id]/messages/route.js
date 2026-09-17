import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, notify } from "@/lib/auth-server";

const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  receiverId: z.string().min(1).optional(),
});

// Student <-> mentor thread. Either side may read; only the two
// participants may write. Reading marks the other side's messages read.
export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const { id } = await params;
  const [mentor] = await sql`SELECT * FROM mentors WHERE user_id = ${id} OR id::text = ${id} LIMIT 1`;
  if (!mentor) return fail("NOT_FOUND", "Mentor not found", 404);
  const other = mentor.user_id;
  // Mentors reading their own id get their inbox: latest message per student.
  if (user.id === other) {
    const threads = await sql`
      SELECT DISTINCT ON (partner) partner, body, created_at, sender_id, p.name AS partner_name
      FROM (
        SELECT CASE WHEN sender_id = ${other} THEN receiver_id ELSE sender_id END AS partner,
               body, created_at, sender_id
        FROM mentor_messages WHERE sender_id = ${other} OR receiver_id = ${other}
      ) t LEFT JOIN profiles p ON p.user_id = t.partner
      ORDER BY partner, created_at DESC
    `;
    const unread = await sql`
      SELECT sender_id AS partner, COUNT(*)::int AS n FROM mentor_messages
      WHERE receiver_id = ${other} AND read_at IS NULL GROUP BY sender_id
    `;
    const unreadBy = Object.fromEntries(unread.map((u) => [u.partner, u.n]));
    return ok({ threads: threads.map((t) => ({ ...t, unread: unreadBy[t.partner] || 0 })) });
  }
  if (user.id !== other) {
    const [rel] = await sql`
      SELECT id FROM mentor_sessions WHERE mentor_id = ${other} AND student_id = ${user.id} LIMIT 1
    `;
    if (!rel) return fail("FORBIDDEN", "Messaging opens after a session request", 403);
  }
  const messages = await sql`
    SELECT * FROM mentor_messages
    WHERE (sender_id = ${user.id} AND receiver_id = ${other})
       OR (sender_id = ${other} AND receiver_id = ${user.id})
    ORDER BY created_at ASC LIMIT 100
  `;
  await sql`
    UPDATE mentor_messages SET read_at = NOW()
    WHERE sender_id = ${other} AND receiver_id = ${user.id} AND read_at IS NULL
  `;
  return ok({ messages });
}

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = messageSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [mentor] = await sql`SELECT * FROM mentors WHERE user_id = ${id} OR id::text = ${id} LIMIT 1`;
  if (!mentor) return fail("NOT_FOUND", "Mentor not found", 404);
  const other = mentor.user_id;
  const isMentor = user.id === other;
  if (!isMentor) {
    const [rel] = await sql`
      SELECT id FROM mentor_sessions WHERE mentor_id = ${other} AND student_id = ${user.id} LIMIT 1
    `;
    if (!rel) return fail("FORBIDDEN", "Messaging opens after a session request", 403);
  }
  const [message] = await sql`
    INSERT INTO mentor_messages (sender_id, receiver_id, body)
    VALUES (${user.id}, ${isMentor ? (body.receiverId || other) : other}, ${body.body})
    RETURNING *
  `;
  const receiver = message.receiver_id;
  await notify({ sql, tenantId: tenant?.id, userId: receiver, type: "message", title: "New message", body: body.body.slice(0, 120), link: "/student/mentorship/sessions" });
  return ok({ message }, { status: 201 });
}
