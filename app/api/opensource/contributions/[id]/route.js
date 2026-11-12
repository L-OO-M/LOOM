import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { awardOssBadges, revokeUnearnedOssBadges } from "@/lib/oss";
import { recordEvidence, recomputeScore, revokeEvidence } from "@/lib/ranking";

const reviewSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  confirmedMatch: z.boolean().optional(),
  reviewNote: z.string().max(500).optional()
});

// Admin verifies (or rejects) a claimed contribution. Verifying awards badges.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = reviewSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const tid = tenant?.id ?? null;
  if (!tid) return fail("TENANT_UNRESOLVED", "Chapter not resolved", 404);
  const [row] = await sql`
    SELECT * FROM student_oss_contributions WHERE id = ${id}
      AND tenant_id = ${tid}::uuid
    LIMIT 1
  `;
  if (!row) return fail("NOT_FOUND", "Contribution not found", 404);
  // Verification is a claim that the linked PR/issue belongs to the tracked
  // repo and that a human actually checked it. Without this, the button was a
  // rubber stamp on whatever URL the student pasted.
  if (body.status === "verified" && body.confirmedMatch !== true) {
    return fail(
      "REVIEW_CONFIRMATION_REQUIRED",
      "Confirm the link points at the claimed repository and contribution before verifying",
      400
    );
  }
  const [updated] = await sql`
    UPDATE student_oss_contributions
    SET status = ${body.status},
        verified_at = CASE WHEN ${body.status} = 'verified' THEN now() ELSE NULL END,
        review_note = COALESCE(${body.reviewNote ?? null}, review_note)
    WHERE id = ${id}
      AND tenant_id = ${tid}::uuid
    RETURNING *
  `;
  let granted = [];
  let revoked = [];
  // One contribution must have one ledger identity. The webhook historically
  // used pr_url while admin review used canonical_url, so the same merge could
  // be counted twice. Use canonical for both, and clear the legacy ref when
  // promoting the row so an older webhook award cannot survive alongside it.
  const canonicalRef = updated.canonical_url || updated.pr_url;
  if (body.status === "verified") {
    // A merged PR is the only OSS claim that counts toward standing. Before
    // this, an admin verification awarded badges but wrote no ranking event,
    // so the highest-weight evidence in the schema was invisible unless a
    // webhook happened to deliver the merge.
    if (updated.contribution_type === "pr") {
      if (updated.pr_url && updated.pr_url !== canonicalRef) {
        await revokeEvidence({
          sql,
          tenantId: tid,
          userId: updated.student_id,
          kind: "oss_verified",
          refId: updated.pr_url
        });
      }
      await recordEvidence({
        sql,
        tenantId: updated.tenant_id,
        userId: updated.student_id,
        kind: "oss_verified",
        refId: canonicalRef,
        verifiedBy: `admin:${user.id}`,
        source: "admin",
        evidence: { repo: updated.repo_url, pr: updated.pr_url, contributionId: updated.id }
      });
      await recomputeScore(sql, updated.tenant_id, updated.student_id);
    }
    granted = await awardOssBadges({ sql, studentId: updated.student_id, tenantId: updated.tenant_id, projectUrl: updated.repo_url });
    await notify({
      sql, tenantId: updated.tenant_id, userId: updated.student_id,
      type: "oss_verified", title: "OSS contribution verified",
      body: `Your contribution ${updated.pr_url} was verified${granted.length ? ` — badge earned: ${granted.join(", ")}` : ""}.`,
      link: "/student/opensource"
    });
  } else {
    // Rejection must undo the standing and the badges the verification
    // created. Leaving either behind means an admin's reversal changes the
    // label but not the score or the credential.
    if (updated.contribution_type === "pr") {
      for (const refId of new Set([canonicalRef, updated.pr_url].filter(Boolean))) {
        await revokeEvidence({
          sql,
          tenantId: tid,
          userId: updated.student_id,
          kind: "oss_verified",
          refId
        });
      }
      await recomputeScore(sql, tid, updated.student_id);
    }
    revoked = await revokeUnearnedOssBadges({
      sql, studentId: updated.student_id, tenantId: tid
    });
    await notify({
      sql, tenantId: tid, userId: updated.student_id,
      type: "oss_rejected", title: "OSS contribution not verified",
      body: `Your contribution ${updated.pr_url} was not verified${revoked.length ? `; badges no longer earned were removed: ${revoked.join(", ")}` : ""}.`,
      link: "/student/opensource"
    });
  }
  await writeAudit({ sql, actorId: user.id, tenantId: tid, action: `oss_${body.status}`, resource: "oss_contribution", resourceId: id, after: { status: body.status, confirmedMatch: body.confirmedMatch === true, reviewNote: body.reviewNote || null, revoked } });
  return ok({ contribution: updated, granted, revoked });
}
