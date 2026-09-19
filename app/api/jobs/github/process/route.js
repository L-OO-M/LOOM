import crypto from "node:crypto";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getSql } from "@/lib/db";
import { env, assertProductionSecrets } from "@/lib/env";
import { isGithubEnabled, resolveStudentIdByLogin } from "@/lib/github";

const jobSchema = z.object({
  idempotencyKey: z.string().min(1),
  eventName: z.string().min(1),
  deliveryId: z.string().min(1),
  repositoryId: z.string().nullable().optional(),
  actorLogin: z.string().nullable().optional(),
  tenantId: z.string().uuid().nullable().optional(),
  summary: z.record(z.any()).default({})
});

// Queue worker for GitHub ingestion (QStash future; nothing calls this yet —
// the webhook processes inline). Gated by QSTASH_TOKEN so a logged-in user
// cannot forge activity: when the token is configured the Bearer header must
// match exactly; when it is not configured the route only serves
// non-production (local queue development).
function authorized(request) {
  const token = env.QSTASH_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  const presented = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  assertProductionSecrets();
  if (!authorized(request)) {
    return fail("UNAUTHORIZED", "Missing or invalid queue authorization", 401);
  }

  let body;
  try {
    body = jobSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const sql = getSql();

  // Kill-switch: per-tenant when the job carries one (mirrors the webhook),
  // otherwise the legacy global flag.
  try {
    const enabled = body.tenantId
      ? await isGithubEnabled(sql, body.tenantId)
      : await sql`SELECT 1 AS on FROM feature_flags WHERE key = 'github_integration' AND enabled = true LIMIT 1`.then((rows) => rows.length > 0);
    if (!enabled) return ok({ processed: false, reason: "GITHUB_INGESTION_PAUSED" });
  } catch {
    return ok({ processed: false, reason: "GITHUB_INGESTION_PAUSED" });
  }

  await sql`
    INSERT INTO github_events (idempotency_key, event_name, delivery_id, actor_login, payload)
    VALUES (
      ${body.idempotencyKey},
      ${body.eventName},
      ${body.deliveryId},
      ${body.actorLogin ?? null},
      ${sql.json({ summary: body.summary })}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
  `;

  const aggregateDelta = {
    commits: body.eventName === "push" ? (body.summary.commits ?? 0) : 0,
    pullRequests: body.eventName === "pull_request" ? 1 : 0,
    reviews: body.eventName === "pull_request_review" ? 1 : 0
  };

  // Attribute to the owning student, not the raw GitHub login:
  // student_daily_activity rows are read by user_id everywhere else
  // (page, dashboard, leaderboard). Unknown logins are skipped, never stored.
  // Tenant-scoped when the job carries one so a login in another chapter
  // can never inflate this chapter's activity.
  const studentId = body.actorLogin
    ? await resolveStudentIdByLogin(sql, body.actorLogin, body.tenantId ?? null)
    : null;
  const total = aggregateDelta.commits + aggregateDelta.pullRequests + aggregateDelta.reviews;
  if (!studentId || total <= 0) {
    return ok({
      processed: true,
      idempotencyKey: body.idempotencyKey,
      aggregateDelta,
      skipped: !studentId ? "UNKNOWN_LOGIN" : "NO_DELTA"
    });
  }

  const today = new Date().toISOString().split("T")[0];
  await sql`
    INSERT INTO student_daily_activity (student_id, day, commits, pull_requests, reviews)
    VALUES (${studentId}, ${today}, ${aggregateDelta.commits}, ${aggregateDelta.pullRequests}, ${aggregateDelta.reviews})
    ON CONFLICT (student_id, day) DO UPDATE SET
      commits = student_daily_activity.commits + EXCLUDED.commits,
      pull_requests = student_daily_activity.pull_requests + EXCLUDED.pull_requests,
      reviews = student_daily_activity.reviews + EXCLUDED.reviews,
      score = (student_daily_activity.score::int + ${aggregateDelta.commits * 5 + aggregateDelta.pullRequests * 10 + aggregateDelta.reviews * 2})::text
  `;

  return ok({
    processed: true,
    idempotencyKey: body.idempotencyKey,
    aggregateDelta
  });
}
