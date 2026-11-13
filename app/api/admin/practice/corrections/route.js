import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { eligible, isReleased } from "@/lib/practice-domain";
import { normalizeWeek, reconcilePracticeEvidence, recomputePracticeScore } from "@/lib/practice";
import { revokeEvidence } from "@/lib/ranking";

const schema = z.object({
  userId: z.string().min(1).max(100),
  questionId: z.string().uuid(),
  credited: z.boolean(),
  acceptedAt: z.string().min(1).max(80).nullable().optional(),
  evidence: z.string().url().max(1000),
  reason: z.string().min(5).max(500)
});

function leetcodeEvidence(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    !["leetcode.com", "www.leetcode.com"].includes(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.port
  ) {
    return null;
  }
  return url.toString();
}

function sameMs(left, right) {
  if (left === null && right === null) return true;
  return Number(left) === Number(right);
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const evidence = leetcodeEvidence(body.evidence);
  if (!evidence) {
    return fail("VALIDATION_ERROR", "Evidence must be an HTTPS LeetCode link.", 400, { field: "evidence" });
  }

  let acceptedAt = null;
  if (body.acceptedAt) {
    const parsed = new Date(body.acceptedAt);
    if (!Number.isFinite(parsed.getTime())) {
      return fail("VALIDATION_ERROR", "Accepted time is invalid.", 400, { field: "acceptedAt" });
    }
    acceptedAt = parsed.getTime();
  }

  const now = Date.now();
  const result = await sql.begin(async (tx) => {
    const [member] = await tx`
      SELECT user_id, name
      FROM profiles
      WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${body.userId}
      LIMIT 1
    `;
    if (!member) return { missing: "member" };

    const [question] = await tx`
      SELECT q.id, q.title, q.week_id, w.title AS week_title, w.status, w.start_at, w.end_at
      FROM practice_questions q
      JOIN practice_weeks w ON w.id = q.week_id
      WHERE q.tenant_id = ${tenant.id}::uuid
        AND q.id = ${body.questionId}::uuid
        AND w.tenant_id = ${tenant.id}::uuid
      FOR UPDATE OF q, w
    `;
    if (!question) return { missing: "question" };
    const week = normalizeWeek(question);
    if (!isReleased(week, now)) {
      return { invalid: "Corrections are only available for released weeks." };
    }
    if (body.credited && (acceptedAt === null || !eligible(week, acceptedAt, now))) {
      return { invalid: "The accepted submission must fall inside the assignment week and cannot be in the future." };
    }

    const [existing] = await tx`
      SELECT credited, accepted_at, evidence_url, reason
      FROM practice_corrections
      WHERE tenant_id = ${tenant.id}::uuid
        AND user_id = ${body.userId}
        AND question_id = ${question.id}::uuid
      FOR UPDATE
    `;
    const existingMs = existing?.accepted_at ? new Date(existing.accepted_at).getTime() : null;
    if (
      existing &&
      existing.credited === body.credited &&
      sameMs(existingMs, body.credited ? acceptedAt : null) &&
      existing.evidence_url === evidence &&
      existing.reason === body.reason.trim()
    ) {
      return { unchanged: true, member, question };
    }

    await tx`
      INSERT INTO practice_corrections
        (tenant_id, user_id, question_id, credited, accepted_at, evidence_url, reason, corrected_by, updated_at)
      VALUES (
        ${tenant.id}::uuid,
        ${body.userId},
        ${question.id}::uuid,
        ${body.credited},
        ${body.credited && acceptedAt !== null ? new Date(acceptedAt) : null},
        ${evidence},
        ${body.reason.trim()},
        ${user.id},
        ${new Date(now)}
      )
      ON CONFLICT (tenant_id, user_id, question_id) DO UPDATE SET
        credited = EXCLUDED.credited,
        accepted_at = EXCLUDED.accepted_at,
        evidence_url = EXCLUDED.evidence_url,
        reason = EXCLUDED.reason,
        corrected_by = EXCLUDED.corrected_by,
        updated_at = EXCLUDED.updated_at
    `;

    if (body.credited) {
      await reconcilePracticeEvidence({
        sql: tx,
        tenantId: tenant.id,
        userId: body.userId,
        questionId: question.id,
        weekId: question.week_id,
        acceptedAt,
        source: "admin",
        verifiedBy: user.id
      });
    } else {
      await revokeEvidence({
        sql: tx,
        tenantId: tenant.id,
        userId: body.userId,
        kind: "dsa_solved",
        refId: question.id
      });
    }
    await recomputePracticeScore(tx, tenant.id, body.userId);

    await writeAudit({
      sql: tx,
      actorId: user.id,
      tenantId: tenant.id,
      action: body.credited ? "granted_practice_credit" : "removed_practice_credit",
      resource: "practice_correction",
      resourceId: question.id,
      before: existing
        ? { credited: existing.credited, acceptedAt: existingMs, reason: existing.reason }
        : null,
      after: {
        userId: body.userId,
        questionId: question.id,
        credited: body.credited,
        acceptedAt: body.credited ? acceptedAt : null,
        evidence,
        reason: body.reason.trim()
      }
    });

    return { member, question };
  });

  if (result.missing === "member") return fail("NOT_FOUND", "Member not found", 404);
  if (result.missing === "question") return fail("NOT_FOUND", "Assigned question not found", 404);
  if (result.invalid) return fail("VALIDATION_ERROR", result.invalid, 400);
  if (result.unchanged) return ok({ unchanged: true });

  await notify({
    sql,
    tenantId: tenant.id,
    userId: body.userId,
    type: "practice",
    title: body.credited ? `Practice credit granted: ${result.question.title}` : `Practice credit removed: ${result.question.title}`,
    body: body.reason.trim(),
    link: "/student/practice"
  });

  return ok({ credited: body.credited, questionId: result.question.id });
}
