import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";
import {
  DAY_MS,
  isReleased,
  validateQuestions,
  weekStart
} from "@/lib/practice-domain";
import { canAuthorPractice, findPracticeDepartment, normalizeWeek, practiceWeekDateToMs } from "@/lib/practice";

const questionSchema = z.object({
  title: z.string().max(160).default(""),
  url: z.string().max(500).default(""),
  difficulty: z.string().max(20).default("Easy"),
  topic: z.string().max(80).default("")
});

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["draft", "scheduled"]),
  questions: z.array(questionSchema).max(7)
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  if (!isAdmin(profile)) {
    const department = await findPracticeDepartment(sql, tenant.id);
    if (!canAuthorPractice(profile, department).ok) {
      return fail("FORBIDDEN", "Only the DSA domain lead or an admin can author practice weeks.", 403);
    }
  }

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const now = Date.now();
  const startAt = practiceWeekDateToMs(body.date);
  if (!Number.isFinite(startAt) || weekStart(startAt) !== startAt) {
    return fail("VALIDATION_ERROR", "Choose a Monday for this assignment.", 400, { field: "date" });
  }
  if (startAt < weekStart(now)) {
    return fail("VALIDATION_ERROR", "Choose the current Monday or a future Monday.", 400, { field: "date" });
  }

  let questions;
  try {
    questions = validateQuestions(body.questions, body.status === "scheduled");
  } catch (error) {
    return fail("VALIDATION_ERROR", error.message, 400, { field: "questions" });
  }

  try {
    const result = await sql.begin(async (tx) => {
      let existing = null;
      if (body.id) {
        [existing] = await tx`
          SELECT *
          FROM practice_weeks
          WHERE id = ${body.id}::uuid AND tenant_id = ${tenant.id}::uuid
          FOR UPDATE
        `;
        if (!existing) return { missing: true };
        if (isReleased(normalizeWeek(existing), now)) {
          return { locked: "Released weeks are locked. Use an admin correction when needed." };
        }
      }

      const [duplicate] = await tx`
        SELECT id
        FROM practice_weeks
        WHERE tenant_id = ${tenant.id}::uuid
          AND start_at = ${new Date(startAt)}
          AND (${body.id ?? null}::uuid IS NULL OR id <> ${body.id ?? null}::uuid)
        LIMIT 1
      `;
      if (duplicate) {
        return { conflict: "An assignment already exists for that week. Edit it instead." };
      }

      const [week] = await tx`
        INSERT INTO practice_weeks
          (id, tenant_id, title, start_at, end_at, status, created_by, updated_at)
        VALUES (
          COALESCE(${body.id ?? null}::uuid, gen_random_uuid()),
          ${tenant.id}::uuid,
          ${body.title.trim()},
          ${new Date(startAt)},
          ${new Date(startAt + 7 * DAY_MS)},
          ${body.status},
          ${user.id},
          ${new Date(now)}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          start_at = EXCLUDED.start_at,
          end_at = EXCLUDED.end_at,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `;

      await tx`
        DELETE FROM practice_questions
        WHERE tenant_id = ${tenant.id}::uuid AND week_id = ${week.id}::uuid
      `;
      for (const question of questions) {
        await tx`
          INSERT INTO practice_questions
            (tenant_id, week_id, position, title, slug, difficulty, topic)
          VALUES (
            ${tenant.id}::uuid,
            ${week.id}::uuid,
            ${question.position},
            ${question.title},
            ${question.slug},
            ${question.difficulty},
            ${question.topic}
          )
        `;
      }

      await writeAudit({
        sql: tx,
        actorId: user.id,
        tenantId: tenant.id,
        action: existing ? "updated_practice_week" : "created_practice_week",
        resource: "practice_week",
        resourceId: week.id,
        before: existing
          ? { title: existing.title, startAt: existing.start_at, status: existing.status }
          : null,
        after: { title: week.title, startAt: week.start_at, status: week.status, questions: questions.length }
      });

      return { week };
    });

    if (result.missing) return fail("NOT_FOUND", "Practice week not found", 404);
    if (result.locked) return fail("WEEK_LOCKED", result.locked, 409);
    if (result.conflict) return fail("WEEK_EXISTS", result.conflict, 409);
    return ok({
      id: result.week.id,
      title: result.week.title,
      status: result.week.status,
      startAt: new Date(result.week.start_at).getTime(),
      endAt: new Date(result.week.end_at).getTime(),
      questions: questions.length
    });
  } catch (error) {
    if (error?.code === "23505") {
      return fail("WEEK_EXISTS", "That week or one of its questions already exists.", 409);
    }
    throw error;
  }
}
