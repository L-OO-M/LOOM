import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadSessionScorecard } from "@/lib/practice-progress";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start")
  }),
  z.object({
    action: z.literal("attempt"),
    questionId: z.string().uuid(),
    outcome: z.enum(["attempted", "solved"]),
    sessionId: z.string().uuid().optional()
  }),
  z.object({
    action: z.literal("complete"),
    sessionId: z.string().uuid()
  })
]);

function serializeSession(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    startedAt: new Date(row.started_at).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null
  };
}

async function findActiveSession(sql, tenantId, userId) {
  const [row] = await sql`
    SELECT id, started_at, completed_at
    FROM practice_sessions
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND completed_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;
  return row ? serializeSession(row) : null;
}

async function createSession(sql, tenantId, userId) {
  try {
    const [row] = await sql`
      INSERT INTO practice_sessions (tenant_id, user_id)
      VALUES (${tenantId}::uuid, ${userId})
      RETURNING id, started_at, completed_at
    `;
    return serializeSession(row);
  } catch (error) {
    if (error?.code === "23505") {
      const active = await findActiveSession(sql, tenantId, userId);
      if (active) return active;
    }
    throw error;
  }
}

async function openSession(sql, tenantId, userId) {
  const active = await findActiveSession(sql, tenantId, userId);
  if (active) return { session: active, created: false };
  return { session: await createSession(sql, tenantId, userId), created: true };
}

async function resolveAttemptSession(sql, tenantId, userId, sessionId) {
  if (!sessionId) {
    const opened = await openSession(sql, tenantId, userId);
    return { session: opened.session };
  }
  const [row] = await sql`
    SELECT id, started_at, completed_at
    FROM practice_sessions
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND id = ${sessionId}::uuid
    LIMIT 1
  `;
  if (!row) return { error: fail("SESSION_NOT_FOUND", "That practice session does not exist.", 404) };
  const session = serializeSession(row);
  if (session.completedAt) {
    return { error: fail("SESSION_CLOSED", "That practice session is already finished.", 409) };
  }
  return { session };
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limit = await checkRateLimit(request, { userId: user.id, limit: 120, windowMs: 60_000 });
  if (!limit.ok) return fail("RATE_LIMITED", `Too many practice updates. Retry after ${limit.retryAfter}s`, 429);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  if (body.action === "start") {
    const opened = await openSession(sql, tenant.id, user.id);
    return ok({ session: opened.session, resumed: !opened.created });
  }

  if (body.action === "attempt") {
    const [question] = await sql`
      SELECT id
      FROM practice_questions
      WHERE tenant_id = ${tenant.id}::uuid
        AND id = ${body.questionId}::uuid
      LIMIT 1
    `;
    if (!question) return fail("QUESTION_NOT_FOUND", "That practice problem is not in this chapter.", 404);

    const resolved = await resolveAttemptSession(sql, tenant.id, user.id, body.sessionId);
    if (resolved.error) return resolved.error;

    const [attempt] = await sql`
      INSERT INTO practice_attempts
        (tenant_id, user_id, question_id, session_id, outcome, source)
      VALUES (
        ${tenant.id}::uuid,
        ${user.id},
        ${body.questionId}::uuid,
        ${resolved.session.id}::uuid,
        ${body.outcome},
        'self'
      )
      RETURNING id, question_id, session_id, outcome, source, created_at
    `;
    return ok({
      session: resolved.session,
      attempt: {
        id: String(attempt.id),
        questionId: String(attempt.question_id),
        sessionId: String(attempt.session_id),
        outcome: attempt.outcome,
        source: attempt.source,
        createdAt: new Date(attempt.created_at).getTime()
      }
    });
  }

  const [updated] = await sql`
    UPDATE practice_sessions
    SET completed_at = NOW()
    WHERE tenant_id = ${tenant.id}::uuid
      AND user_id = ${user.id}
      AND id = ${body.sessionId}::uuid
      AND completed_at IS NULL
    RETURNING id, started_at, completed_at
  `;
  let session = updated ? serializeSession(updated) : null;
  if (!session) {
    const [existing] = await sql`
      SELECT id, started_at, completed_at
      FROM practice_sessions
      WHERE tenant_id = ${tenant.id}::uuid
        AND user_id = ${user.id}
        AND id = ${body.sessionId}::uuid
      LIMIT 1
    `;
    if (!existing) return fail("SESSION_NOT_FOUND", "That practice session does not exist.", 404);
    session = serializeSession(existing);
  }

  const scorecard = await loadSessionScorecard(sql, {
    tenantId: tenant.id,
    userId: user.id,
    sessionId: session.id
  });
  return ok({ session, scorecard });
}
