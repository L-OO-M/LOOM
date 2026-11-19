import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { readAccessToken } from "@/lib/github-oauth";
import { parseForkUrl, verifyForkOwnership } from "@/lib/debug";
import { DOMAIN_ORDER, normalizeDomainKey } from "@/lib/domains";
import {
  loadMyOssSubmissions,
  resolveChallengeRepo
} from "@/lib/oss-challenges";

const schema = z.object({
  domain: z.enum(DOMAIN_ORDER),
  repoFullName: z.string().min(3).max(200),
  forkUrl: z.string().min(1).max(500),
  note: z.string().max(1000).optional().default("")
});

function ctxError(ctx) {
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  return null;
}

/** GET /api/challenges/oss — the member's society-challenge submissions. */
export async function GET(request) {
  const ctx = await getRequestContext();
  const err = ctxError(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const domain = normalizeDomainKey(new URL(request.url).searchParams.get("domain"));
  const submissions = await loadMyOssSubmissions(sql, tenant.id, user.id, {
    domain: domain || null
  });
  return ok({ submissions });
}

/**
 * POST /api/challenges/oss — submit a fork of a society or curated repository.
 *
 * The write is only a claim until GitHub confirms the fork belongs to the
 * member and contains their commit. Approval is a separate human action
 * (PATCH /api/challenges/oss/[id]) that records ranking evidence.
 */
export async function POST(request) {
  const ctx = await getRequestContext();
  const err = ctxError(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limit = await checkRateLimit(request, {
    userId: user.id,
    limit: 10,
    windowMs: 60_000,
    durable: true
  });
  if (!limit.ok) return fail("RATE_LIMITED", `Too many submissions. Retry after ${limit.retryAfter}s`, 429);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const domain = normalizeDomainKey(body.domain);
  if (!domain) return fail("VALIDATION_ERROR", "Unknown domain", 400);

  const repo = await resolveChallengeRepo(sql, {
    tenantId: tenant.id,
    domain,
    repoFullName: body.repoFullName
  });
  if (!repo) {
    return fail(
      "REPO_NOT_ALLOWED",
      "Submit a fork of the society challenge repository or a repository curated for this domain.",
      400,
      { field: "repoFullName" }
    );
  }

  const parsed = parseForkUrl(body.forkUrl);
  if (!parsed) {
    return fail("VALIDATION_ERROR", "Paste the URL of your GitHub fork.", 400, { field: "forkUrl" });
  }
  if (parsed.fullName.toLowerCase() === repo.fullName.toLowerCase()) {
    return fail("VALIDATION_ERROR", "That is the upstream repository. Submit your own fork.", 400, {
      field: "forkUrl"
    });
  }

  const [existing] = await sql`
    SELECT *
    FROM oss_challenge_submissions
    WHERE tenant_id = ${tenant.id}::uuid
      AND user_id = ${user.id}
      AND repo_full_name = ${repo.fullName}
    LIMIT 1
  `;
  const sameFork =
    existing &&
    String(existing.fork_full_name || "").toLowerCase() === parsed.fullName.toLowerCase();
  if (existing?.status === "approved") {
    if (sameFork) {
      return ok({
        unchanged: true,
        submission: {
          verificationStatus: existing.verification_status,
          status: existing.status
        }
      });
    }
    return fail(
      "ALREADY_APPROVED",
      "An approved submission already exists for this repository. Ask a lead if it needs correction.",
      409
    );
  }
  if (
    existing?.verification_status === "verified" &&
    existing.status === "submitted" &&
    sameFork
  ) {
    return ok({
      unchanged: true,
      message: "This fork is already verified and waiting for review.",
      submission: { verificationStatus: existing.verification_status, status: existing.status }
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

  // No publication date: the society repository predates the submission, so
  // "fork created after the challenge" is the wrong gate here. Ownership, the
  // fork parent, and an authored commit are the checks that matter.
  const verification = await verifyForkOwnership({
    accessToken: token.accessToken,
    forkFullName: parsed.fullName,
    challengeRepoFullName: repo.fullName,
    challengePublishedAt: null,
    expectedOwner: connection.github_username
  });

  const isVerified = verification.status === "verified";
  const rejected = verification.status === "rejected";
  const verificationStatus = isVerified ? "verified" : rejected ? "rejected" : "error";
  const status = rejected ? "rejected" : "submitted";
  const reason = verification.reason || null;

  try {
    const saved = await sql.begin(async (tx) => {
      if (isVerified && verification.repoId) {
        const [duplicate] = await tx`
          SELECT id, user_id
          FROM oss_challenge_submissions
          WHERE tenant_id = ${tenant.id}::uuid
            AND fork_repo_id = ${verification.repoId}
            AND user_id <> ${user.id}
          LIMIT 1
        `;
        if (duplicate) return { duplicate: true };
      }

      const [row] = await tx`
        INSERT INTO oss_challenge_submissions
          (tenant_id, user_id, project_id, domain, repo_full_name, fork_url, fork_full_name,
           fork_repo_id, note, status, verification_status, verification_reason,
           review_feedback, reviewed_by, reviewed_at, updated_at)
        VALUES (
          ${tenant.id}::uuid,
          ${user.id},
          ${repo.projectId},
          ${domain},
          ${repo.fullName},
          ${parsed.url},
          ${parsed.fullName},
          ${isVerified ? verification.repoId : null},
          ${body.note || ""},
          ${status},
          ${verificationStatus},
          ${reason},
          ${rejected ? reason : ""},
          NULL,
          NULL,
          NOW()
        )
        ON CONFLICT (tenant_id, user_id, repo_full_name) DO UPDATE SET
          project_id = EXCLUDED.project_id,
          domain = EXCLUDED.domain,
          fork_url = EXCLUDED.fork_url,
          fork_full_name = EXCLUDED.fork_full_name,
          fork_repo_id = EXCLUDED.fork_repo_id,
          note = EXCLUDED.note,
          status = EXCLUDED.status,
          verification_status = EXCLUDED.verification_status,
          verification_reason = EXCLUDED.verification_reason,
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
        action: "submitted_society_oss_fork",
        resource: "oss_challenge_submission",
        resourceId: row.id,
        after: {
          domain,
          repo: repo.fullName,
          fork: parsed.fullName,
          verificationStatus
        }
      });
      return { row };
    });

    if (saved.duplicate) {
      return fail(
        "FORK_ALREADY_CLAIMED",
        "This fork is already linked to another member. Use your own fork.",
        409
      );
    }

    return ok({
      submission: {
        verificationStatus,
        status,
        verificationReason: reason
      },
      message:
        verificationStatus === "verified"
          ? "Fork verified. It is now in the domain lead's review queue."
          : verificationStatus === "error"
            ? reason || "GitHub is unavailable. Your submission stays pending; try again shortly."
            : reason
    }, { status: 201 });
  } catch (error) {
    if (error?.code === "23505") {
      return fail(
        "FORK_ALREADY_CLAIMED",
        "This fork is already linked to another member. Use your own fork.",
        409
      );
    }
    throw error;
  }
}
