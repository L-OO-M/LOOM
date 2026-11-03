import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { FLAG_REASONS } from "@/lib/community";
import { checkRateLimit } from "@/lib/rate-limit";

const flagSchema = z.object({
  targetType: z.enum(["thread", "reply"]),
  targetId: z.string().uuid(),
  reason: z.enum(FLAG_REASONS).default("spam")
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const limited = await checkRateLimit(`flags:${user.id}`, { durable: true, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many flags — slow down", 429);
  let body;
  try {
    body = flagSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const tid = ctx.tenant.id;
  // Validate the target BEFORE inserting the flag. forum_flags has no foreign
  // key, so an unchecked insert left permanent rows pointing at arbitrary UUIDs
  // and made a foreign thread's id indistinguishable from a real one.
  //
  // forum_replies has no tenant_id of its own; its tenant is the thread's, so
  // the reply check joins through to forum_threads rather than using the bogus
  // `forum_replies.tenant_id` predicate that made every reply flag a no-op.
  let targetTable;
  if (body.targetType === "thread") {
    const [target] = await sql`
      SELECT id FROM forum_threads
      WHERE id = ${body.targetId}::uuid AND tenant_id = ${tid}::uuid
      LIMIT 1
    `;
    if (!target) return fail("NOT_FOUND", "Thread not found", 404);
    targetTable = "forum_threads";
  } else {
    const [target] = await sql`
      SELECT r.id FROM forum_replies r
      JOIN forum_threads t ON t.id = r.thread_id
      WHERE r.id = ${body.targetId}::uuid AND t.tenant_id = ${tid}::uuid
      LIMIT 1
    `;
    if (!target) return fail("NOT_FOUND", "Reply not found", 404);
    targetTable = "forum_replies";
  }

  // Only count the flag when a new row was actually inserted — a repeat
  // flag from the same student is a no-op, not another vote for hiding.
  const inserted = await sql`
    INSERT INTO forum_flags (student_id, target_type, target_id, reason)
    VALUES (${user.id}, ${body.targetType}, ${body.targetId}, ${body.reason})
    ON CONFLICT (student_id, target_type, target_id) DO NOTHING
    RETURNING id
  `;
  if (inserted.length > 0) {
    if (targetTable === "forum_threads") {
      await sql`UPDATE forum_threads SET flag_count = flag_count + 1 WHERE id = ${body.targetId} AND tenant_id = ${tid}::uuid`;
    } else {
      await sql`UPDATE forum_replies SET flag_count = flag_count + 1 WHERE id = ${body.targetId}`;
    }
    await writeAudit({ sql, actorId: user.id, tenantId: tid, action: "flagged_content", resource: `forum_${body.targetType}`, resourceId: body.targetId, after: { reason: body.reason } });
  }
  return ok({ flagged: true });
}
