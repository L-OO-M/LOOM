import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { canReviewDebugDomain } from "@/lib/debug";
import { recordEvidence, revokeEvidence, recomputeScore } from "@/lib/ranking";

const schema = z.object({
  submissionId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  feedback: z.string().min(5).max(2000)
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const result = await sql.begin(async (tx) => {
    const [submission] = await tx`
      SELECT s.*, c.domain, c.slug AS challenge_slug, c.title AS challenge_title
      FROM debug_submissions s
      JOIN debug_challenges c ON c.id = s.challenge_id
      WHERE s.id = ${body.submissionId}::uuid
        AND s.tenant_id = ${tenant.id}::uuid
        AND c.tenant_id = ${tenant.id}::uuid
      FOR UPDATE OF s
    `;
    if (!submission) return { missing: true };
    if (submission.user_id === user.id) {
      return { forbidden: "You cannot review your own submission." };
    }
    if (!canReviewDebugDomain(profile, submission.domain)) {
      return { forbidden: "Only the matching domain lead or an admin can review this submission." };
    }
    if (body.decision === "approved" && submission.verification_status !== "verified") {
      return { invalid: "This fork has not passed GitHub verification yet." };
    }

    const feedback = body.feedback.trim();
    if (
      submission.review_status === body.decision &&
      (submission.review_feedback || "") === feedback
    ) {
      return { unchanged: true, submission };
    }

    const [updated] = await tx`
      UPDATE debug_submissions
      SET review_status = ${body.decision},
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
        kind: "debug_fixed",
        refId: submission.challenge_id,
        verifiedBy: user.id,
        source: "debug_review",
        evidence: {
          submissionId: submission.id,
          challengeId: submission.challenge_id,
          domain: submission.domain,
          forkUrl: submission.fork_url
        }
      });
    } else {
      await revokeEvidence({
        sql: tx,
        tenantId: tenant.id,
        userId: submission.user_id,
        kind: "debug_fixed",
        refId: submission.challenge_id
      });
    }
    await recomputeScore(tx, tenant.id, submission.user_id);

    await writeAudit({
      sql: tx,
      actorId: user.id,
      tenantId: tenant.id,
      action: body.decision === "approved" ? "approved_debug_submission" : "rejected_debug_submission",
      resource: "debug_submission",
      resourceId: submission.id,
      before: {
        reviewStatus: submission.review_status,
        feedback: submission.review_feedback
      },
      after: {
        reviewStatus: body.decision,
        feedback
      }
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
    type: "debug",
    title:
      body.decision === "approved"
        ? `Debug challenge approved: ${result.submission.challenge_title}`
        : `Debug challenge needs work: ${result.submission.challenge_title}`,
    body: body.feedback.trim(),
    link: `/student/debug/${result.submission.challenge_slug}`
  });

  return ok({
    reviewStatus: body.decision,
    challengeId: result.submission.challenge_id
  });
}
