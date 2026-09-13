import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, notify } from "@/lib/auth-server";

const replySchema = z.object({ body: z.string().min(1).max(8000) });
const patchSchema = z.object({
  action: z.enum(["solve", "pin"]),
  replyId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional()
});

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { id } = await params;
  const [thread] = await sql`
    SELECT t.*, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.id = ${id} AND t.tenant_id = ${tenant?.id ?? null}::uuid AND t.status = 'visible'
    LIMIT 1
  `;
  if (!thread) return fail("NOT_FOUND", "Thread not found", 404);
  await sql`UPDATE forum_threads SET view_count = view_count + 1 WHERE id = ${id}`;
  const replies = await sql`
    SELECT r.*, p.name AS author_name FROM forum_replies r
    LEFT JOIN profiles p ON p.user_id = r.author_id
    WHERE r.thread_id = ${id} AND r.status = 'visible'
    ORDER BY r.is_answer DESC, r.upvote_count DESC, r.created_at ASC
    LIMIT 200
  `;
  return ok({ thread, replies });
}

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = replySchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [thread] = await sql`
    SELECT id, author_id FROM forum_threads
    WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid AND status = 'visible' LIMIT 1
  `;
  if (!thread) return fail("NOT_FOUND", "Thread not found", 404);
  const [reply] = await sql`
    INSERT INTO forum_replies (thread_id, author_id, body)
    VALUES (${id}, ${user.id}, ${body.body}) RETURNING *
  `;
  await sql`UPDATE forum_threads SET reply_count = reply_count + 1, updated_at = now() WHERE id = ${id}`;
  if (thread.author_id !== user.id) {
    await notify({
      sql, tenantId: tenant?.id, userId: thread.author_id,
      type: "forum_reply", title: "New reply to your thread",
      body: "Someone replied to your discussion.", link: `/community/forums/${id}`
    });
  }
  return ok({ reply }, { status: 201 });
}

// Author marks a reply as the solution; admins pin/unpin.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [thread] = await sql`
    SELECT * FROM forum_threads WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid LIMIT 1
  `;
  if (!thread) return fail("NOT_FOUND", "Thread not found", 404);
  const isAdmin = profile?.role === "admin";
  if (body.action === "pin") {
    if (!isAdmin) return fail("FORBIDDEN", "Admin access required", 403);
    await sql`UPDATE forum_threads SET pinned = ${body.pinned ?? true} WHERE id = ${id}`;
    return ok({ pinned: body.pinned ?? true });
  }
  if (thread.author_id !== user.id && !isAdmin) return fail("FORBIDDEN", "Only the author can mark a solution", 403);
  if (!body.replyId) return fail("VALIDATION_ERROR", "replyId is required", 400);
  await sql`UPDATE forum_replies SET is_answer = false WHERE thread_id = ${id}`;
  await sql`UPDATE forum_replies SET is_answer = true WHERE id = ${body.replyId} AND thread_id = ${id}`;
  await sql`UPDATE forum_threads SET solved = true, solution_post_id = ${body.replyId} WHERE id = ${id}`;
  return ok({ solved: true });
}
