import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { recordEvidence, recomputeScore, revokeEvidence } from "@/lib/ranking";

const judgeSchema = z.object({
  submissionId: z.string().uuid(),
  status: z.enum(["submitted", "shortlisted", "winner", "rejected"]),
  score: z.number().int().min(0).max(100).nullable().optional(),
  feedback: z.string().max(2000).default("")
});

// Judge one contest submission and record the consequence atomically.
//
// The ranking contract advertises `contest_top` and nothing wrote it before this
// route existed. A winner gets evidence keyed by (contest, student); moving the
// same submission out of `winner` revokes it, so a correction cannot leave a
// stale 25-point claim behind. Judging your own entry is allowed to save the
// grade but never to verify your own points.
export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  let body;
  try {
    body = judgeSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const result = await sql.begin(async (tx) => {
    const [submission] = await tx`
      SELECT s.id, s.student_id, s.contest_id, s.status AS previous_status, c.title AS contest_title
      FROM contest_submissions s
      JOIN contests c ON c.id = s.contest_id
      WHERE s.id = ${body.submissionId}
        AND c.tenant_id = ${tenant.id}::uuid
      FOR UPDATE OF s
    `;
    if (!submission) return null;

    const [updated] = await tx`
      UPDATE contest_submissions
      SET status = ${body.status},
          score = ${body.score ?? null},
          feedback = ${body.feedback || ""},
          judged_by = ${user.id},
          judged_at = NOW()
      WHERE id = ${submission.id}
      RETURNING *
    `;

    const wasWinner = submission.previous_status === "winner";
    const isWinner = body.status === "winner";
    const canVerify = submission.student_id !== user.id;
    let evidence = null;

    if (isWinner && canVerify) {
      evidence = await recordEvidence({
        sql: tx,
        tenantId: tenant.id,
        userId: submission.student_id,
        kind: "contest_top",
        refId: submission.contest_id,
        verifiedBy: user.id,
        source: "contest_judging",
        evidence: {
          contestId: submission.contest_id,
          submissionId: submission.id,
          score: body.score ?? null
        }
      });
    } else if (wasWinner && !isWinner && canVerify) {
      await revokeEvidence({
        sql: tx,
        tenantId: tenant.id,
        userId: submission.student_id,
        kind: "contest_top",
        refId: submission.contest_id
      });
    }

    await writeAudit({
      sql: tx,
      actorId: user.id,
      tenantId: tenant.id,
      action: "judged_contest_submission",
      resource: "contest",
      resourceId: submission.contest_id,
      after: {
        submissionId: submission.id,
        status: body.status,
        score: body.score ?? null,
        evidenceId: evidence?.id ?? null
      }
    });

    return { updated, submission, canVerify };
  });

  if (!result?.updated) return fail("NOT_FOUND", "Submission not found", 404);

  if (result.canVerify) {
    await recomputeScore(sql, tenant.id, result.submission.student_id);
  }

  const label = {
    submitted: "back in review",
    shortlisted: "shortlisted",
    winner: "selected",
    rejected: "not selected"
  }[body.status];
  await notify({
    sql,
    tenantId: tenant.id,
    userId: result.submission.student_id,
    type: "contest",
    title: `Entry ${label}: ${result.submission.contest_title}`,
    body: body.feedback || "Open the challenge to read the judge's feedback.",
    link: `/student/contests/${result.submission.contest_id}`
  });

  return ok({ submission: result.updated });
}
