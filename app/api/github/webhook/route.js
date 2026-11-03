import { env, assertProductionSecrets } from "@/lib/env";
import { ok, fail } from "@/lib/api";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  GITHUB_EVENT_MAX_ATTEMPTS,
  GITHUB_EVENT_STATUS,
  classifyGitHubDelivery,
  githubEventNextAttemptAt,
  isGithubEnabled,
  normalizeGitHubEvent,
  notifyOnce,
  resolveStudentIdByLogin,
  verifyGitHubSignature,
  webhookNotificationKey
} from "@/lib/github";
import { awardOssBadges } from "@/lib/oss";
import { recordEvidence, recomputeScore } from "@/lib/ranking";
import { applyIssueEvent } from "@/lib/github-issues";
import { toIsoDay } from "@/lib/github-activity";
import { getSql } from "@/lib/db";
import { ACTIVITY_WEIGHTS, activityDeltaPoints } from "@/lib/scoring";

// The daily activity row and the standings board share this contract. Exporting
// the constant from the route makes the webhook/standings parity explicit and
// testable; the values themselves live only in lib/scoring.js.
export { ACTIVITY_WEIGHTS };

/**
 * Turn one delivery into a countable activity delta.
 *
 * Counted: pushes (by commit count) and pull_request / pull_request_review
 * deliveries by the opening actor. Deliberately NOT counted: `ping`, `*`
 * repository traffic with no commits, and pull_request actions other than
 * `opened`/`reopened` -- otherwise a PR that receives fifty comments would
 * inflate a student's proof fifty times over.
 *
 * Pure, so the counting rules are testable without a database.
 */
export function summarizeDelivery(eventName, payload) {
  const zero = { commits: 0, pullRequests: 0, reviews: 0 };
  if (eventName === "push") {
    return { ...zero, commits: Array.isArray(payload?.commits) ? payload.commits.length : 0 };
  }
  if (eventName === "pull_request") {
    const action = payload?.action;
    return { ...zero, pullRequests: action === "opened" || action === "reopened" ? 1 : 0 };
  }
  if (eventName === "pull_request_review") {
    const action = payload?.action;
    return { ...zero, reviews: action === "submitted" ? 1 : 0 };
  }
  return zero;
}

export async function POST(request) {
  assertProductionSecrets();
  const tenant = await getTenantFromRequest(request);
  if (!tenant) return fail("TENANT_NOT_FOUND", "Tenant could not be resolved", 404);

  const limited = checkRateLimit(`github:${tenant.id}`, { limit: 120, windowMs: 60000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many GitHub webhook requests", 429);

  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const eventName = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");

  if (!eventName || !deliveryId) {
    return fail("GITHUB_HEADERS_MISSING", "GitHub webhook headers are missing", 400);
  }

  if (!verifyGitHubSignature({ payload, signature, secret: env.GITHUB_WEBHOOK_SECRET })) {
    return fail("GITHUB_SIGNATURE_INVALID", "GitHub signature is invalid", 401);
  }

  // Ping is GitHub's connectivity check: ack it (proves the URL works)
  // without storing anything.
  if (eventName === "ping") {
    return ok({ accepted: true, ping: true, tenantId: tenant.id });
  }

  let raw;
  try {
    raw = JSON.parse(payload);
  } catch {
    return fail("GITHUB_BAD_JSON", "Webhook payload is not valid JSON", 400);
  }

  const sql = getSql();
  // Paused until the chapter enables github_integration in /admin/flags:
  // acknowledge (so GitHub stays green) but store and act on nothing.
  if (!(await isGithubEnabled(sql, tenant.id))) {
    return ok({ accepted: false, reason: "GITHUB_INGESTION_PAUSED", tenantId: tenant.id });
  }

  const idempotencyKey = `${deliveryId}-${eventName}`;
  const normalized = normalizeGitHubEvent({ eventName, deliveryId, payload: raw });

  // CLAIM THE DELIVERY.
  //
  // github_events is the durable work item: INSERT (or find) the row and move it
  // to `processing` in one statement. The row is claimed only when it is new,
  // when a previous attempt failed and its backoff has elapsed, or when a
  // `processing` row's lease has expired (a crashed/timed-out processor). This
  // is what makes a redelivery able to resume work instead of being dismissed
  // as a duplicate forever.
  //
  // github_events gains repository_name / student_id / tenant_id (migration 037)
  // so "which repositories does this student have signed deliveries for?" is an
  // indexed lookup rather than a scan over the jsonb payload.
  const [claimed] = await sql`
    WITH inserted AS (
      INSERT INTO github_events (idempotency_key, event_name, delivery_id, actor_login, payload, repository_name, tenant_id)
      VALUES (
        ${idempotencyKey},
        ${normalized.eventName},
        ${normalized.deliveryId},
        ${normalized.actorLogin},
        ${sql.json(raw)},
        ${normalized.repositoryName},
        ${tenant.id}
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING idempotency_key
    )
    UPDATE github_events e
       SET status = 'processing',
           attempts = e.attempts + 1,
           claimed_at = NOW(),
           last_error = NULL
     WHERE e.idempotency_key = ${idempotencyKey}
       AND (
         (
           e.status IN ('pending', 'failed')
           AND (e.next_attempt IS NULL OR e.next_attempt <= NOW())
         )
         OR (
           e.status = 'processing'
           AND e.claimed_at < NOW() - interval '5 minutes'
         )
       )
    RETURNING e.*
  `;

  if (!claimed) {
    const [row] = await sql`
      SELECT status, claimed_at, next_attempt, attempts
      FROM github_events WHERE idempotency_key = ${idempotencyKey} LIMIT 1
    `;
    if (!row) {
      return fail("GITHUB_DELIVERY_STATE_MISSING", "The delivery row could not be read after insert", 500);
    }
    // No side effects this time. The response says which state stopped us so a
    // postmortem can distinguish "already done" from "another worker owns it".
    return ok({
      accepted: true,
      duplicate: true,
      tenantId: tenant.id,
      event: normalized,
      processing: classifyGitHubDelivery(row)
    });
  }

  let verified = null;
  let featureRequest = null;
  let activation = null;
  let activity = { applied: false, reason: "NO_DELTA" };

  try {
    // OSS auto-verify: a merged PR in a tracked repo verifies the student's
    // claimed contribution (or records it) and awards badges. Every write here
    // is idempotent (ON CONFLICT / recordEvidence / badge DO NOTHING), so a
    // retry after a partial fan-out cannot double-count.
    verified = await maybeVerifyOssMerge({ sql, tenantId: tenant.id, eventName, raw });
    const reviewed = await maybeVerifyOssReview({ sql, tenantId: tenant.id, eventName, raw });
    if (reviewed) verified = verified || reviewed;

    // Feature requests mirror a GitHub issue, so closing or reopening the issue
    // is a product decision the board must follow. Matched by (repo, number);
    // the request's own tenant is used, never the delivery's.
    if (eventName === "issues" && raw?.issue) {
      featureRequest = await applyIssueEvent({
        sql,
        repo: raw.repository?.full_name,
        issue: raw.issue
      });
      if (featureRequest && (raw.action === "closed" || raw.action === "reopened")) {
        await notifyOnce({
          sql,
          tenantId: featureRequest.tenant_id,
          userId: featureRequest.requester_id,
          type: "feature_request",
          title: `Your idea "${featureRequest.title}" is now ${featureRequest.status}`,
          body: raw.action === "closed" ? "Synced from GitHub." : "The GitHub issue was reopened.",
          link: "/student/feature-requests",
          dedupeKey: webhookNotificationKey("feature_request", featureRequest.id, raw.action)
        });
      }
    }

    // Project activation: a signed delivery that carries real work in a
    // repository a student has claimed is the proof that promotes that project
    // from provisional to verified.
    activation = await maybeActivateProject({ sql, tenantId: tenant.id, eventName, raw });

    // Aggregate into student_daily_activity, which every "proof of building"
    // number is read from (heatmap, commit/PR/streak tiles, standings). The
    // additive upsert runs inside the same transaction that claims
    // activity_applied_at, so a retry resumes without adding the same commits
    // twice.
    activity = await applyActivity({ sql, tenantId: tenant.id, idempotencyKey, eventName, normalized, raw });
  } catch (error) {
    const attempts = Number(claimed.attempts) || 1;
    const terminal = attempts >= GITHUB_EVENT_MAX_ATTEMPTS;
    const message = errorMessage(error);
    try {
      await sql`
        UPDATE github_events
           SET status = ${terminal ? GITHUB_EVENT_STATUS.DEAD : GITHUB_EVENT_STATUS.FAILED},
               last_error = ${message},
               next_attempt = ${terminal ? null : githubEventNextAttemptAt(attempts)},
               claimed_at = NULL
         WHERE idempotency_key = ${idempotencyKey}
           AND status = 'processing'
      `;
    } catch (markError) {
      // The row stays `processing`; after the lease expires a redelivery can
      // claim it again. Losing the failure timestamp is better than a 500 with
      // no record of why.
      console.error("[github/webhook] could not record failure state", markError?.message || markError);
    }
    console.error("[github/webhook] delivery processing failed", {
      deliveryId,
      eventName,
      tenantId: tenant.id,
      attempts,
      terminal,
      reason: message
    });
    return fail("GITHUB_PROCESSING_FAILED", "Webhook processing failed; redelivery will retry it", 503);
  }

  // Mark processed only AFTER the fan-out. If this write fails the row remains
  // `processing`; the lease expiry lets a redelivery retry, and every side
  // effect above is safe to repeat.
  try {
    await sql`
      UPDATE github_events
         SET status = 'processed',
             processed_at = NOW(),
             last_error = NULL,
             next_attempt = NULL,
             claimed_at = NULL
       WHERE idempotency_key = ${idempotencyKey}
         AND status = 'processing'
    `;
  } catch (e) {
    console.error("[github/webhook] could not mark delivery processed", e?.message || e);
  }

  // Audit the ingestion itself. This path is reachable by anything that knows
  // the webhook secret, and it promotes a claim to `verified` and grants badges
  // -- so it must leave a trace.
  try {
    await sql`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, metadata)
      VALUES (
        ${normalized.actorLogin || "github-webhook"},
        ${tenant.id},
        ${verified ? "github_oss_auto_verified" : "github_event_received"},
        'github_event',
        ${idempotencyKey},
        ${sql.json({
          event: eventName,
          repository: normalized.repositoryName,
          actor: normalized.actorLogin,
          delivery: deliveryId,
          student: verified?.userId ?? null,
          pr_url: verified?.prUrl ?? null,
          activity_applied: activity.applied === true,
          activity_reason: activity.reason ?? null,
          activity_student: activity.studentId ?? null,
          feature_request: featureRequest?.id ?? null,
          feature_request_status: featureRequest?.status ?? null,
          project_activated: activation?.projectId ?? null
        })}
      )
    `;
  } catch (e) {
    console.error("[github/webhook] audit insert failed", e?.message || e);
  }

  return ok({
    accepted: true,
    tenantId: tenant.id,
    event: normalized,
    ossVerified: !!verified,
    activity,
    featureRequest: featureRequest
      ? { id: featureRequest.id, status: featureRequest.status, state: featureRequest.github_issue_state }
      : null
  });
}

/**
 * Add one delivery to the daily activity ledger at most once.
 *
 * The claim of activity_applied_at and the additive upsert share one
 * transaction: either both commit or neither does. A crash between them cannot
 * leave a claimed-but-not-counted row, and a retry of an already-counted
 * delivery returns DUPLICATE_DELIVERY instead of inflating the student's score.
 */
async function applyActivity({ sql, tenantId, idempotencyKey, eventName, normalized, raw }) {
  const delta = summarizeDelivery(eventName, raw);
  if (delta.commits + delta.pullRequests + delta.reviews === 0) {
    return { applied: false, reason: "NO_DELTA" };
  }
  const studentId = normalized.actorLogin
    ? await resolveStudentIdByLogin(sql, normalized.actorLogin, tenantId)
    : null;
  if (!studentId) return { applied: false, reason: "UNKNOWN_LOGIN" };

  const day = toIsoDay(new Date());
  const points = activityDeltaPoints(delta);

  return sql.begin(async (tx) => {
    const [claim] = await tx`
      UPDATE github_events
         SET activity_applied_at = NOW()
       WHERE idempotency_key = ${idempotencyKey}
         AND activity_applied_at IS NULL
      RETURNING idempotency_key
    `;
    if (!claim) return { applied: false, reason: "DUPLICATE_DELIVERY" };

    await tx`
      INSERT INTO public.student_daily_activity
        (student_id, day, tenant_id, commits, pull_requests, reviews, score)
      VALUES (${studentId}, ${day}, ${tenantId}, ${delta.commits}, ${delta.pullRequests}, ${delta.reviews}, ${points})
      ON CONFLICT (student_id, day) DO UPDATE SET
        commits       = public.student_daily_activity.commits + EXCLUDED.commits,
        pull_requests = public.student_daily_activity.pull_requests + EXCLUDED.pull_requests,
        reviews       = public.student_daily_activity.reviews + EXCLUDED.reviews,
        score         = public.student_daily_activity.score + EXCLUDED.score,
        tenant_id     = EXCLUDED.tenant_id
    `;
    // Record the attribution on the event row too, so the attested-repo index
    // (tenant_id, student_id, repository_name) is populated for this student and
    // this repository rather than only for un-attributed deliveries.
    await tx`
      UPDATE public.github_events SET student_id = ${studentId}
      WHERE idempotency_key = ${idempotencyKey}
    `;
    return { applied: true, studentId, day, ...delta };
  });
}

function errorMessage(error) {
  return String(error?.message || error || "unknown error").slice(0, 500);
}

/**
 * Promote a provisional project to verified when a signed delivery proves real
 * work in its repository.
 *
 * A push or an opened pull request carrying commits, authored by the student
 * who claimed the project, in the repository they claimed. That is the whole
 * proof — a delivery that reached this endpoint was signed with the chapter's
 * webhook secret, so it cannot be manufactured by the student.
 *
 * Honest limit: this only fires for repositories whose owner has pointed a
 * webhook at this deployment. There is no GitHub OAuth in this project, so
 * nothing can install one on a student's behalf. A project in a repo with no
 * webhook stays provisional and is confirmed by hand in /admin/ranking, which
 * is why that queue exists rather than being a nice-to-have.
 */
async function maybeActivateProject({ sql, tenantId, eventName, raw }) {
  // Only deliveries that represent actual work. `ping`, issue comments and
  // repository traffic with no commits carry no evidence of building, so they
  // must not activate anything.
  const delta = summarizeDelivery(eventName, raw);
  if (delta.commits + delta.pullRequests === 0) return null;

  const fullName = raw?.repository?.full_name;
  const author = raw?.sender?.login;
  if (!fullName || !author) return null;

  const [candidate] = await sql`
    SELECT p.id, p.owner_id, p.tenant_id
      FROM projects p
      JOIN github_connections g ON g.user_id = p.owner_id
     WHERE lower(p.repo_full_name) = lower(${fullName})
       AND p.tenant_id = ${tenantId}::uuid
       AND p.evidence_state = 'provisional'
       AND lower(g.github_username) = lower(${author})
     LIMIT 1
  `;
  if (!candidate) return null;

  // Attribute to the student, tenant-scoped, using the same resolver as the
  // activity aggregate so a login from another chapter can never activate a
  // project here.
  const studentId = await resolveStudentIdByLogin(sql, author, tenantId);
  if (!studentId || studentId !== candidate.owner_id) return null;

  const [updated] = await sql`
    UPDATE projects
       SET evidence_state = 'verified',
           verified_at = NOW(),
           verified_by = ${author},
           updated_at = NOW()
     WHERE id = ${candidate.id}
       AND evidence_state = 'provisional'
    RETURNING *
  `;
  // Lost the race to a concurrent delivery, or an admin already decided. Either
  // way this delivery changes nothing.
  if (!updated) return null;

  await recordEvidence({
    sql,
    tenantId,
    userId: studentId,
    kind: "project_verified",
    refId: updated.id,
    // The verifier is the GitHub login on the signed delivery. This is the same
    // idiom the audit log already uses for system verification: attribute the
    // row to what actually caused it rather than inventing a user id.
    verifiedBy: `github:${author}`,
    source: "webhook",
    evidence: { repository: fullName, event: eventName, delivery: raw?.delivery ?? null }
  });
  await recomputeScore(sql, tenantId, studentId);

  await notifyOnce({
    sql, tenantId, userId: studentId,
    type: "project_verified",
    title: "Project verified",
    body: `We saw your work in ${fullName} — "${updated.title}" now counts toward your standing.`,
    link: "/student/projects",
    dedupeKey: webhookNotificationKey("project_verified", updated.id)
  });

  return { projectId: updated.id, userId: studentId, repository: fullName, event: eventName };
}

// A submitted code review is a real contribution, but unlike a merged PR it
// leaves no artifact in the PR's state. GitHub still attests it in a signed
// `pull_request_review` delivery, so verify it there instead of waiting for an
// admin to take the student's word for it.
async function maybeVerifyOssReview({ sql, tenantId, eventName, raw }) {
  if (eventName !== "pull_request_review") return null;
  if (raw?.action !== "submitted") return null;
  const review = raw?.review;
  const pr = raw?.pull_request;
  if (!review?.user?.login || !pr?.number) return null;
  if (review.state === "dismissed" || review.state === "pending") return null;
  const fullName = raw?.repository?.full_name;
  if (!fullName) return null;
  const [owner, repo] = fullName.split("/");
  const [project] = await sql`
    SELECT * FROM open_source_projects
    WHERE lower(owner) = lower(${owner}) AND lower(repo_name) = lower(${repo})
      AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
    LIMIT 1
  `;
  if (!project) return null;
  const [profile] = await sql`
    SELECT p.user_id FROM profiles p
    LEFT JOIN github_connections g ON g.user_id = p.user_id
    WHERE (lower(p.github_username) = lower(${review.user.login})
      OR lower(g.github_username) = lower(${review.user.login}))
      AND p.tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  if (!profile) return null;
  const canonical = `https://github.com/${fullName.toLowerCase()}/pull/${pr.number}`;
  const [row] = await sql`
    INSERT INTO student_oss_contributions
      (student_id, tenant_id, project_id, repo_url, pr_url, canonical_url, pr_number, title, contribution_type, status, verified_at)
    VALUES (${profile.user_id}, ${tenantId}, ${project.id}, ${project.github_repo_url},
      ${pr.html_url || canonical}, ${canonical}, ${pr.number},
      ${`Review on #${pr.number}`.slice(0, 200)}, 'review', 'verified', now())
    ON CONFLICT (student_id, canonical_url) WHERE canonical_url IS NOT NULL DO UPDATE SET
      status = 'verified', verified_at = now()
      WHERE student_oss_contributions.contribution_type = 'review'
    RETURNING *
  `;
  if (!row || row.contribution_type !== "review") return null;
  const granted = await awardOssBadges({ sql, studentId: profile.user_id, tenantId, projectUrl: project.github_repo_url });
  await notifyOnce({
    sql, tenantId, userId: profile.user_id,
    type: "oss_verified", title: "Code review verified",
    body: `Your review on ${fullName}#${pr.number} counts${granted.length ? ` — badge earned: ${granted.join(", ")}` : ""}.`,
    link: "/student/opensource",
    dedupeKey: webhookNotificationKey("oss_review", canonical)
  });
  return { userId: profile.user_id, review: true, granted };
}

async function maybeVerifyOssMerge({ sql, tenantId, eventName, raw }) {
  if (eventName !== "pull_request") return null;
  const pr = raw?.pull_request;
  if (!pr?.merged || raw?.action !== "closed") return null;
  const fullName = raw?.repository?.full_name;
  const author = pr?.user?.login;
  if (!fullName || !author) return null;
  const [owner, repo] = fullName.split("/");
  const [project] = await sql`
    SELECT * FROM open_source_projects
    WHERE lower(owner) = lower(${owner}) AND lower(repo_name) = lower(${repo})
      AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
    LIMIT 1
  `;
  if (!project) return null;
  const [profile] = await sql`
    SELECT p.user_id FROM profiles p
    LEFT JOIN github_connections g ON g.user_id = p.user_id
    WHERE (lower(p.github_username) = lower(${author}) OR lower(g.github_username) = lower(${author}))
      AND p.tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  if (!profile) return null;
  const prUrl = pr.html_url || `https://github.com/${fullName}/pull/${pr.number}`;
  const canonical = `https://github.com/${fullName.toLowerCase()}/pull/${pr.number}`;
  await sql`
    INSERT INTO student_oss_contributions
      (student_id, tenant_id, project_id, repo_url, pr_url, canonical_url, pr_number, title, contribution_type, status, merged_at, files_changed, lines_added, lines_deleted, verified_at)
    VALUES (${profile.user_id}, ${tenantId}, ${project.id}, ${project.github_repo_url}, ${prUrl}, ${canonical}, ${pr.number ?? null}, ${(pr.title || "").slice(0, 200)}, 'pr', 'verified', ${pr.merged_at || new Date().toISOString()}, ${pr.changed_files ?? 0}, ${pr.additions ?? 0}, ${pr.deletions ?? 0}, now())
    ON CONFLICT (student_id, canonical_url) WHERE canonical_url IS NOT NULL DO UPDATE SET
      status = 'verified', contribution_type = 'pr', merged_at = EXCLUDED.merged_at,
      files_changed = EXCLUDED.files_changed, lines_added = EXCLUDED.lines_added,
      lines_deleted = EXCLUDED.lines_deleted, verified_at = now()
  `;
const granted = await awardOssBadges({ sql, studentId: profile.user_id, tenantId, projectUrl: project.github_repo_url });

  // A merged PR in a tracked repository is the strongest thing on the board --
  // it is the one piece of evidence that is both externally produced and
  // independently checkable by anyone with the URL. Before this change
  // migration 027 declared an `oss_verified` kind worth 20 and nothing ever
  // wrote one, so the highest-weight evidence in the schema scored nothing.
  await recordEvidence({
    sql,
    tenantId,
    userId: profile.user_id,
    kind: "oss_verified",
    // Canonical, matching admin verification: refId is the ledger identity, so
    // using the raw html_url here let one merge be awarded twice.
    refId: canonical,
    verifiedBy: `github:${author}`,
    source: "webhook",
    evidence: { repository: fullName, pr: prUrl, merged_at: pr.merged_at ?? null }
  });
  await recomputeScore(sql, tenantId, profile.user_id);

  await notifyOnce({
    sql, tenantId, userId: profile.user_id,
    type: "oss_verified", title: "PR merged — OSS verified",
    body: `Your PR in ${fullName} was merged${granted.length ? ` — badge earned: ${granted.join(", ")}` : ""}.`,
    link: "/student/opensource",
    dedupeKey: webhookNotificationKey("oss_merge", canonical)
  });
  return { userId: profile.user_id, prUrl, granted };
}