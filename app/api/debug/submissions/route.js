import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { readAccessToken } from "@/lib/github-oauth";
import { parseForkUrl, verifyForkOwnership, debugChallengeRepo } from "@/lib/debug";

const schema = z.object({
  challengeId: z.string().uuid(),
  forkUrl: z.string().min(1).max(500),
  prUrl: z.string().max(500).optional().nullable()
});

function githubPrUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
  if (!/^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(url.pathname)) return null;
  return url.toString();
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const parsed = parseForkUrl(body.forkUrl);
  if (!parsed) {
    return fail("VALIDATION_ERROR", "Paste the URL of a GitHub fork.", 400, { field: "forkUrl" });
  }
  const prUrl = githubPrUrl(body.prUrl);
  if (body.prUrl && !prUrl) {
    return fail("VALIDATION_ERROR", "Paste the GitHub pull-request URL (…/pull/123).", 400, { field: "prUrl" });
  }

  const [challenge] = await sql`
    SELECT id, slug, title, domain, repo_path, is_published, published_at, created_at
    FROM debug_challenges
    WHERE tenant_id = ${tenant.id}::uuid
      AND id = ${body.challengeId}::uuid
      AND is_published = true
    LIMIT 1
  `;
  if (!challenge) return fail("NOT_FOUND", "Published debug challenge not found", 404);

  const [existing] = await sql`
    SELECT *
    FROM debug_submissions
    WHERE tenant_id = ${tenant.id}::uuid
      AND user_id = ${user.id}
      AND challenge_id = ${challenge.id}::uuid
    LIMIT 1
  `;
  const sameFork = existing && String(existing.fork_full_name || "").toLowerCase() === parsed.fullName.toLowerCase();
  if (existing?.review_status === "approved") {
    if (sameFork) return ok({ unchanged: true, verificationStatus: existing.verification_status, reviewStatus: existing.review_status });
    return fail("ALREADY_APPROVED", "An approved submission is already recorded. Ask a domain lead if it needs correction.", 409);
  }
  if (
    existing?.verification_status === "verified" &&
    existing.review_status === "submitted" &&
    sameFork
  ) {
    return ok({
      unchanged: true,
      verificationStatus: existing.verification_status,
      reviewStatus: existing.review_status,
      message: "This fork is already verified and waiting for review."
    });
  }

  const [connection] = await sql`
    SELECT github_username
    FROM github_connections
    WHERE user_id = ${user.id}
    LIMIT 1
  `;
  const token = await readAccessToken({ sql, userId: user.id });
  if (!token.ok || !connection?.github_username) {
    return fail("GITHUB_NOT_LINKED", "Link your GitHub account before submitting a fork.", 409);
  }

  const publishedAt = challenge.published_at
    ? new Date(challenge.published_at).getTime()
    : new Date(challenge.created_at).getTime();
  const verification = await verifyForkOwnership({
    accessToken: token.accessToken,
    forkFullName: parsed.fullName,
    challengeRepoFullName: debugChallengeRepo(),
    challengePublishedAt: publishedAt,
    expectedOwner: connection.github_username
  });

  const isVerified = verification.status === "verified";
  const rejected = verification.status === "rejected";
  const reviewStatus = rejected ? "rejected" : "submitted";
  const verificationStatus = isVerified ? "verified" : rejected ? "rejected" : "error";
  const verificationReason = verification.reason || null;

  try {
    const saved = await sql.begin(async (tx) => {
      if (isVerified && verification.repoId) {
        const [duplicate] = await tx`
          SELECT id, user_id
          FROM debug_submissions
          WHERE tenant_id = ${tenant.id}::uuid
            AND fork_repo_id = ${verification.repoId}
            AND user_id <> ${user.id}
          LIMIT 1
        `;
        if (duplicate) {
          return { duplicate: true };
        }
      }

      const [row] = await tx`
        INSERT INTO debug_submissions
          (tenant_id, challenge_id, user_id, fork_url, fork_full_name, fork_repo_id, fork_owner,
           pr_url, verification_status, verification_reason, last_checked_at, review_status,
           review_feedback, reviewed_by, reviewed_at, updated_at)
        VALUES (
          ${tenant.id}::uuid,
          ${challenge.id}::uuid,
          ${user.id},
          ${parsed.url},
          ${parsed.fullName},
          ${isVerified ? verification.repoId : null},
          ${isVerified ? parsed.owner : null},
          ${prUrl},
          ${verificationStatus},
          ${verificationReason},
          NOW(),
          ${reviewStatus},
          ${rejected ? verificationReason : ""},
          NULL,
          NULL,
          NOW()
        )
        ON CONFLICT (tenant_id, user_id, challenge_id) DO UPDATE SET
          fork_url = EXCLUDED.fork_url,
          fork_full_name = EXCLUDED.fork_full_name,
          fork_repo_id = EXCLUDED.fork_repo_id,
          fork_owner = EXCLUDED.fork_owner,
          pr_url = EXCLUDED.pr_url,
          verification_status = EXCLUDED.verification_status,
          verification_reason = EXCLUDED.verification_reason,
          last_checked_at = EXCLUDED.last_checked_at,
          review_status = EXCLUDED.review_status,
          review_feedback = EXCLUDED.review_feedback,
          reviewed_by = NULL,
          reviewed_at = NULL,
          updated_at = NOW()
        RETURNING *
      `;

      await writeAudit({
        sql: tx,
        actorId: user.id,
        tenantId: tenant.id,
        action: "submitted_debug_fork",
        resource: "debug_submission",
        resourceId: row.id,
        after: {
          challengeId: challenge.id,
          fork: parsed.fullName,
          verificationStatus,
          reviewStatus
        }
      });
      return { row };
    });

    if (saved.duplicate) {
      const [rejectedRow] = await sql`
        UPDATE debug_submissions
        SET verification_status = 'rejected',
            verification_reason = 'This fork is already linked to another member.',
            fork_repo_id = NULL,
            fork_owner = NULL,
            last_checked_at = NOW(),
            review_status = 'rejected',
            review_feedback = 'This fork is already linked to another member.',
            reviewed_by = NULL,
            reviewed_at = NULL,
            updated_at = NOW()
        WHERE tenant_id = ${tenant.id}::uuid
          AND user_id = ${user.id}
          AND challenge_id = ${challenge.id}::uuid
        RETURNING *
      `;
      return ok({
        submissionId: rejectedRow?.id ?? null,
        verificationStatus: "rejected",
        reviewStatus: "rejected",
        message: "This fork is already linked to another member."
      });
    }

    return ok({
      submissionId: saved.row.id,
      verificationStatus,
      reviewStatus,
      message:
        verificationStatus === "verified"
          ? "Fork verified. It is now in the domain lead's review queue."
          : verificationStatus === "error"
            ? verification.reason || "GitHub is unavailable. Your submission stays pending."
            : verification.reason
    });
  } catch (error) {
    if (error?.code === "23505") {
      return ok({
        verificationStatus: "rejected",
        reviewStatus: "rejected",
        message: "This fork is already linked to another member."
      });
    }
    throw error;
  }
}
