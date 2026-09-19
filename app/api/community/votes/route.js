import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { toggleVote } from "@/lib/community";

const voteSchema = z.object({
  targetType: z.enum(["thread", "reply", "snippet"]),
  targetId: z.string().uuid()
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  // In-memory per-instance bucket: cheap abuse brake, not a distributed limiter.
  const limited = checkRateLimit(`votes:${user.id}`, { limit: 60, windowMs: 60000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many votes — slow down", 429);
  let body;
  try {
    body = voteSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  try {
    const result = await toggleVote({ sql, studentId: user.id, targetType: body.targetType, targetId: body.targetId, tenantId: tenant?.id ?? null });
    return ok(result);
  } catch {
    return fail("INVALID_TARGET", "Vote target is invalid", 400);
  }
}
