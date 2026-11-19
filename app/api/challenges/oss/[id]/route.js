import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { canReviewDebugDomain } from "@/lib/debug";
import { recordEvidence, revokeEvidence, recomputeScore } from "@/lib/ranking";

const schema = z.object({
  decision: z.enum(["approved", "rejected"]),
  feedback: z.string().min(5).max(2000)
});

/**
 * PATCH /api/challenges/oss/[id] — grade one society-challenge submission.
 *
 * Approval is the only thing that records a point: an `oss_challenge` evidence
 * row, verified by this reviewer, then a derived score recompute. Rejection
 * removes any previous evidence and never deletes the submission itself, so the
 * history and the feedback survive.
 */
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("NOT_FOUND", "Submission not found", 404);
  }
  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const result = await sql.begin(async (tx) => {
    const [submission] = await tx`
      SELECT *
      FROM oss_challenge_submissions
      WHERE id = ${id}::uuid
        AND tenant_id = ${tenant.id}::uuid
      FOR UPDATE
    `;
    if (!submission) return { missing: true };
    if (String(submission.user_id) === String(user.id)) {
      return { forbidden: "You cannot review your own submission." };
    }
    if (!canReviewDebugDomain(profile, submission.domain)) {
      return { forbidden: "Only the matching domain lead or an admin can review this submission." };
    }
    if (body.decision === "approved" && submission.verification_status !== "verified") {
      return { invalid: "This fork has not passed GitHub verification yet." };
    }

    const feedback = body.feedback.trim();
    if (submission.status === body.decision && (submission.review_feedback || "") === feedback) {
      return { unchanged: true };
    }

    const [updated] = await tx`
      UPDATE oss_challenge_submissions
      SET status = ${body.decision},
          review_feedback = ${feedback},
          reviewed_by = ${user.id},
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = ${submission.id}::uuid
      RETURNING *
    `;

    if (body.decision === "approved") {
      await recordEvidence({
        sql: tx,
        tenantId: tenant.id,
        userId: submission.user_id,
        kind: "oss_challenge",
        refId: submission.id,
        verifiedBy: user.id,
        source: "society_review",
        evidence: {
          submissionId: submission.id,
          domain: submission.domain,
          repo: submission.repo_full_name,
          forkUrl: submission.fork_url
        }
      });
    } else {
      await revokeEvidence({
        sql: tx,
        tenantId: tenant.id,
        userId: submission.user_id,
        kind: "oss_challenge",
        refId: submission.id
      });
    }
    await recomputeScore(tx, tenant.id, submission.user_id);

    await writeAudit({
      sql: tx,
      actorId: user.id,
      tenantId: tenant.id,
      action:
        body.decision === "approved"
          ? "approved_society_oss_submission"
          : "rejected_society_oss_submission",
      resource: "oss_challenge_submission",
      resourceId: submission.id,
      before: { status: submission.status, feedback: submission.review_feedback },
      after: { status: body.decision, feedback }
    });

    return { submission, updated };
  });

  if (result.missing) return fail("NOT_FOUND", "Submission not found", 404);
  if (result.forbidden) return fail("FORBIDDEN", result.forbidden, 403);
  if (result.invalid) return fail("INVALID_STATE", result.invalid, 409);
  if (result.unchanged) return ok({ unchanged: true });

  await notify({
    sql,
    tenantId: tenant.id,
    userId: result.submission.user_id,
    type: "opensource",
    title:
      body.decision === "approved"
        ? `Society challenge approved: ${result.submission.repo_full_name}`
        : `Society challenge returned: ${result.submission.repo_full_name}`,
    body: body.feedback.trim(),
    link: `/student/challenges?domain=${encodeURIComponent(result.submission.domain)}`
  });

  return ok({ status: body.decision, id: result.submission.id });
}
