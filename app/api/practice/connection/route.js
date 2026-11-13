import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeLeetCodeUsername } from "@/lib/leetcode";

const schema = z.object({
  username: z.string().min(1).max(80)
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limit = await checkRateLimit(request, { userId: user.id, limit: 5, windowMs: 60_000, durable: true });
  if (!limit.ok) return fail("RATE_LIMITED", `Too many requests. Retry after ${limit.retryAfter}s`, 429);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const username = normalizeLeetCodeUsername(body.username);
  if (!username) {
    return fail("VALIDATION_ERROR", "Enter a LeetCode username, not a profile URL.", 400, {
      field: "username"
    });
  }

  try {
    const result = await sql.begin(async (tx) => {
      const [existing] = await tx`
        SELECT leetcode_username
        FROM practice_connections
        WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id}
        FOR UPDATE
      `;
      if (existing && existing.leetcode_username !== username) {
        const [{ count = 0 } = {}] = await tx`
          SELECT COUNT(*)::int AS count
          FROM practice_solves
          WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id}
        `;
        if (Number(count) > 0) {
          return {
            conflict: "Your LeetCode username is fixed after progress is recorded. Ask an admin for a correction."
          };
        }
      }
      const [saved] = await tx`
        INSERT INTO practice_connections
          (tenant_id, user_id, leetcode_username, active, next_sync_at, sync_state, updated_at)
        VALUES (
          ${tenant.id}::uuid,
          ${user.id},
          ${username},
          true,
          NOW(),
          'never',
          NOW()
        )
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET
          leetcode_username = EXCLUDED.leetcode_username,
          active = true,
          sync_state = CASE
            WHEN practice_connections.leetcode_username = EXCLUDED.leetcode_username
              THEN practice_connections.sync_state
            ELSE 'never'
          END,
          sync_error = CASE
            WHEN practice_connections.leetcode_username = EXCLUDED.leetcode_username
              THEN practice_connections.sync_error
            ELSE NULL
          END,
          next_sync_at = CASE
            WHEN practice_connections.leetcode_username = EXCLUDED.leetcode_username
              THEN practice_connections.next_sync_at
            ELSE NOW()
          END,
          updated_at = NOW()
        RETURNING *
      `;
      await writeAudit({
        sql: tx,
        actorId: user.id,
        tenantId: tenant.id,
        action: "linked_practice_username",
        resource: "practice_connection",
        resourceId: user.id,
        before: existing ? { username: existing.leetcode_username } : null,
        after: { username }
      });
      return { saved };
    });

    if (result.conflict) return fail("USERNAME_LOCKED", result.conflict, 409);
    return ok({
      username: result.saved.leetcode_username,
      syncState: result.saved.sync_state
    });
  } catch (error) {
    if (error?.code === "23505") {
      return fail("USERNAME_TAKEN", "That LeetCode username is already linked to another member.", 409);
    }
    throw error;
  }
}
