import { z } from "zod";
import { ok, validationError } from "@/lib/api";
import { getSql } from "@/lib/db";

const jobSchema = z.object({
  idempotencyKey: z.string().min(1),
  eventName: z.string().min(1),
  deliveryId: z.string().min(1),
  repositoryId: z.string().nullable().optional(),
  actorLogin: z.string().nullable().optional(),
  summary: z.record(z.any()).default({})
});

export async function POST(request) {
  let body;
  try {
    body = jobSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const sql = getSql();

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

  if (body.actorLogin && aggregateDelta.commits > 0) {
    const today = new Date().toISOString().split("T")[0];
    await sql`
      INSERT INTO student_daily_activity (student_id, day, commits)
      VALUES (${body.actorLogin}, ${today}, ${aggregateDelta.commits})
      ON CONFLICT (student_id, day) DO UPDATE SET
        commits = student_daily_activity.commits + EXCLUDED.commits,
        score = (student_daily_activity.score::int + ${aggregateDelta.commits * 5})::text
    `;
  }

  return ok({
    processed: true,
    idempotencyKey: body.idempotencyKey,
    aggregateDelta
  });
}