import { env, assertProductionSecrets } from "@/lib/env";
import { ok, fail } from "@/lib/api";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { isGithubEnabled, normalizeGitHubEvent, resolveStudentIdByLogin, verifyGitHubSignature } from "@/lib/github";
import { awardOssBadges } from "@/lib/oss";
import { notify } from "@/lib/auth-server";
import { recordEvidence, recomputeScore } from "@/lib/ranking";
import { getSql } from "@/lib/db";

// Weights for the daily activity row. commit/pullRequest MUST match
// STANDINGS_WEIGHTS in lib/standings.js, because the leaderboard computes
// score = commits x5 + prs x20 from these columns. The `reviews` weight is
// only used for the stored score here; the leaderboard does not count reviews
// yet (see the note at the top of lib/standings.js).
const ACTIVITY_WEIGHTS = { commit: 5, pullRequest: 20, review: 2 };

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

const normalized = normalizeGitHubEvent({ eventName, deliveryId, payload: raw });

  // github_events gains repository_name / student_id / tenant_id (migration
  // 037) so "which repositories does this student have signed deliveries for?"
  // is an indexed lookup rather than a scan over the jsonb payload. Both
  // project activation and the audit queue depend on that being cheap.
  const [storedEvent] = await sql`
    INSERT INTO github_events (idempotency_key, event_name, delivery_id, actor_login, payload, repository_name, tenant_id)
    VALUES (
      ${`${deliveryId}-${eventName}`},
      ${normalized.eventName},
      ${normalized.deliveryId},
      ${normalized.actorLogin},
      ${sql.json(raw)},
      ${normalized.repositoryName},
      ${tenant.id}
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET repository_name = EXCLUDED.repository_name,
          tenant_id = EXCLUDED.tenant_id
    RETURNING (xmax = 0) AS inserted
  `;
  // xmax = 0 means this INSERT created the row; a non-zero xmax means ON
  // CONFLICT took the UPDATE branch, i.e. GitHub redelivered something we had
  // already recorded.
  const inserted = storedEvent?.inserted === true;

  // OSS auto-verify: a merged PR in a tracked repo verifies the student's
  // claimed contribution (or records it) and awards badges. Best-effort —
  // must never break webhook acknowledgement.
  let verified = null;
  try {
    verified = await maybeVerifyOssMerge({ sql, tenantId: tenant.id, eventName, raw });
  } catch {
    /* ignore */
  }

  // Project activation: a signed delivery that carries real work in a
  // repository a student has claimed is the proof that promotes that project
  // from provisional to verified. Same trust level as the merge check above and
  // the same best-effort treatment — neither may break acknowledgement.
  let activation = null;
  try {
    activation = await maybeActivateProject({ sql, tenantId: tenant.id, eventName, raw });
  } catch (e) {
    console.error("[github/webhook] project activation failed", e?.message || e);
  }

  // Aggregate into student_daily_activity.
  //
  // This is the table every "your proof of building" number is read from:
  // the heatmap and commit/PR/streak tiles on /student/github, the dashboard's
  // weekly strip, and commits x5 + prs x20 in the leaderboard score (55% of
  // the advertised formula). The webhook previously wrote ONLY github_events,
  // so all of those stayed at zero forever regardless of real activity -- the
  // standalone /api/jobs/github/process worker that used to do this had no
  // callers, no cron and no vercel.json.
  //
  // Attributed to the student who LINKED the GitHub username, tenant-scoped so
  // a login belonging to another chapter cannot inflate this one's numbers.
  //
  // Replay safety: the aggregate upsert below is ADDITIVE (commits = commits +
  // EXCLUDED.commits), which was deliberate but unbounded — a redelivered
  // signed payload added the same commits again, and nothing anywhere recorded
  // that the delivery had already been counted. `counted` now comes from the
  // github_events insert above: xmax = 0 means this delivery was new. A
  // duplicate is recorded in github_events (so it stays auditable) but is NOT
  // aggregated a second time.
  let activity = { applied: false, reason: "NO_DELTA" };
  try {
    const delta = summarizeDelivery(eventName, raw);
    const studentId = normalized.actorLogin
      ? await resolveStudentIdByLogin(sql, normalized.actorLogin, tenant.id)
      : null;
    if (!studentId) {
      activity = { applied: false, reason: "UNKNOWN_LOGIN" };
    } else if (delta.commits + delta.pullRequests + delta.reviews === 0) {
      activity = { applied: false, reason: "NO_DELTA" };
    } else if (!inserted) {
      activity = { applied: false, reason: "DUPLICATE_DELIVERY" };
    } else {
      const day = new Date().toISOString().slice(0, 10);
      const points =
        delta.commits * ACTIVITY_WEIGHTS.commit +
        delta.pullRequests * ACTIVITY_WEIGHTS.pullRequest +
        delta.reviews * ACTIVITY_WEIGHTS.review;
      await sql`
        INSERT INTO public.student_daily_activity
          (student_id, day, tenant_id, commits, pull_requests, reviews, score)
        VALUES (${studentId}, ${day}, ${tenant.id}, ${delta.commits}, ${delta.pullRequests}, ${delta.reviews}, ${points})
        ON CONFLICT (student_id, day) DO UPDATE SET
          commits       = public.student_daily_activity.commits + EXCLUDED.commits,
          pull_requests = public.student_daily_activity.pull_requests + EXCLUDED.pull_requests,
          reviews       = public.student_daily_activity.reviews + EXCLUDED.reviews,
          score         = public.student_daily_activity.score + EXCLUDED.score,
          tenant_id     = EXCLUDED.tenant_id
      `;
      // Record the attribution on the event row too, so the attested-repo index
      // (tenant_id, student_id, repository_name) is populated for this student
      // and this repository rather than only for un-attributed deliveries.
      await sql`
        UPDATE public.github_events SET student_id = ${studentId}
        WHERE idempotency_key = ${`${deliveryId}-${eventName}`}
      `;
      activity = { applied: true, studentId, day, ...delta };
    }
  } catch (e) {
    console.error("[github/webhook] activity aggregate failed", e?.message || e);
    activity = { applied: false, reason: "WRITE_FAILED" };
  }


  // Audit the ingestion itself. This path is reachable by anything that knows
  // the webhook secret, and it promotes a claim to `verified` and grants badges
  // -- so it must leave a trace. Before this, /admin/audit showed nothing at all
  // for webhook activity, which made a bad or forged merge indistinguishable
  // from no merge.
  //
  // actor_id is NOT NULL: attribute the row to the GitHub login that caused it,
  // falling back to a literal marker rather than inventing a user. If this ever
  // fails we log it instead of swallowing it -- a silent audit insert is exactly
  // the hole this change exists to close.
  try {
    await sql`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, metadata)
      VALUES (
        ${normalized.actorLogin || "github-webhook"},
        ${tenant.id},
        ${verified ? "github_oss_auto_verified" : "github_event_received"},
        'github_event',
        ${`${deliveryId}-${eventName}`},
        ${sql.json({
          event: eventName,
          repository: normalized.repositoryName,
          actor: normalized.actorLogin,
          delivery: deliveryId,
          student: verified?.userId ?? null,
          pr_url: verified?.prUrl ?? null,
          activity_applied: activity.applied === true,
          activity_reason: activity.reason ?? null,
          activity_student: activity.studentId ?? null
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
    activity
  });
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

  await notify({
    sql, tenantId, userId: studentId,
    type: "project_verified",
    title: "Project verified",
    body: `We saw your work in ${fullName} — "${updated.title}" now counts toward your standing.`,
    link: "/student/projects"
  });

  return { projectId: updated.id, userId: studentId, repository: fullName, event: eventName };
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
  await sql`
    INSERT INTO student_oss_contributions
      (student_id, tenant_id, project_id, repo_url, pr_url, pr_number, title, contribution_type, status, merged_at, files_changed, lines_added, lines_deleted, verified_at)
    VALUES (${profile.user_id}, ${tenantId}, ${project.id}, ${project.github_repo_url}, ${prUrl}, ${pr.number ?? null}, ${(pr.title || "").slice(0, 200)}, 'pr', 'verified', ${pr.merged_at || new Date().toISOString()}, ${pr.changed_files ?? 0}, ${pr.additions ?? 0}, ${pr.deletions ?? 0}, now())
    ON CONFLICT (student_id, pr_url) DO UPDATE SET
      status = 'verified', merged_at = EXCLUDED.merged_at,
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
    refId: prUrl,
    verifiedBy: `github:${author}`,
    source: "webhook",
    evidence: { repository: fullName, pr: prUrl, merged_at: pr.merged_at ?? null }
  });
  await recomputeScore(sql, tenantId, profile.user_id);

  await notify({
    sql, tenantId, userId: profile.user_id,
    type: "oss_verified", title: "PR merged — OSS verified",
    body: `Your PR in ${fullName} was merged${granted.length ? ` — badge earned: ${granted.join(", ")}` : ""}.`,
    link: "/student/opensource"
  });
  return { userId: profile.user_id, prUrl, granted };
}