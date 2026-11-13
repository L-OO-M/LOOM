import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncConnection } from "@/lib/practice-sync";

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limit = await checkRateLimit(request, { userId: user.id, limit: 3, windowMs: 10 * 60_000, durable: true });
  if (!limit.ok) return fail("RATE_LIMITED", `Too many refreshes. Retry after ${limit.retryAfter}s`, 429);

  const [connection] = await sql`
    SELECT leetcode_username
    FROM practice_connections
    WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id} AND active = true
    LIMIT 1
  `;
  if (!connection) {
    return fail("NOT_LINKED", "Link your LeetCode username before refreshing progress.", 409);
  }

  const result = await syncConnection(sql, {
    tenantId: tenant.id,
    userId: user.id,
    manual: true
  });

  if (result.status === "skipped") {
    return fail("RATE_LIMITED", result.message || "Try again in a few minutes.", 429);
  }
  if (result.status === "error") {
    return fail("SYNC_FAILED", result.message || "Sync unavailable. Recorded progress is preserved.", 502);
  }
  return ok({
    status: result.status,
    received: result.received,
    matched: result.matched,
    credited: result.credited,
    message: result.message
  });
}
