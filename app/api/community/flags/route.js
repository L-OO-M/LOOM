import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { FLAG_REASONS } from "@/lib/community";

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
  let body;
  try {
    body = flagSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
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
    if (body.targetType === "thread") {
      await sql`UPDATE forum_threads SET flag_count = flag_count + 1 WHERE id = ${body.targetId}`;
    } else {
      await sql`UPDATE forum_replies SET flag_count = flag_count + 1 WHERE id = ${body.targetId}`;
    }
  }
  return ok({ flagged: true });
}
