import { env, assertProductionSecrets } from "@/lib/env";
import { ok, fail } from "@/lib/api";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { isGithubEnabled, normalizeGitHubEvent, resolveStudentIdByLogin, verifyGitHubSignature } from "@/lib/github";
import { awardOssBadges } from "@/lib/oss";
import { notify } from "@/lib/auth-server";
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

  await sql`
    INSERT INTO github_events (idempotency_key, event_name, delivery_id, actor_login, payload)
    VALUES (
      ${`${deliveryId}-${eventName}`},
      ${normalized.eventName},
      ${normalized.deliveryId},
      ${normalized.actorLogin},
      ${sql.json(raw)}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
  `;

  // OSS auto-verify: a merged PR in a tracked repo verifies the student's
  // claimed contribution (or records it) and awards badges. Best-effort —
  // must never break webhook acknowledgement.
  let verified = null;
  try {
    verified = await maybeVerifyOssMerge({ sql, tenantId: tenant.id, eventName, raw });
  } catch {
    /* ignore */
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
  // Idempotent on (student_id, day) via additive upsert, and GitHub delivery
  // ids are unique so replays are the only duplication risk -- handled by the
  // same additive upsert, which is intentional.
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
  await notify({
    sql, tenantId, userId: profile.user_id,
    type: "oss_verified", title: "PR merged â€” OSS verified",
    body: `Your PR in ${fullName} was merged${granted.length ? ` â€” badge earned: ${granted.join(", ")}` : ""}.`,
    link: "/student/opensource"
  });
  return { userId: profile.user_id, prUrl, granted };
}