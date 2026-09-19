import { env, assertProductionSecrets } from "@/lib/env";
import { ok, fail } from "@/lib/api";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { isGithubEnabled, normalizeGitHubEvent, verifyGitHubSignature } from "@/lib/github";
import { awardOssBadges } from "@/lib/oss";
import { notify } from "@/lib/auth-server";
import { getSql } from "@/lib/db";

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
  try {
    await maybeVerifyOssMerge({ sql, tenantId: tenant.id, eventName, raw });
  } catch {
    /* ignore */
  }

  return ok({
    accepted: true,
    tenantId: tenant.id,
    event: normalized
  });
}

async function maybeVerifyOssMerge({ sql, tenantId, eventName, raw }) {
  if (eventName !== "pull_request") return;
  const pr = raw?.pull_request;
  if (!pr?.merged || raw?.action !== "closed") return;
  const fullName = raw?.repository?.full_name;
  const author = pr?.user?.login;
  if (!fullName || !author) return;
  const [owner, repo] = fullName.split("/");
  const [project] = await sql`
    SELECT * FROM open_source_projects
    WHERE lower(owner) = lower(${owner}) AND lower(repo_name) = lower(${repo})
      AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
    LIMIT 1
  `;
  if (!project) return;
  const [profile] = await sql`
    SELECT p.user_id FROM profiles p
    LEFT JOIN github_connections g ON g.user_id = p.user_id
    WHERE (lower(p.github_username) = lower(${author}) OR lower(g.github_username) = lower(${author}))
      AND (p.tenant_id IS NULL OR p.tenant_id = ${tenantId}::uuid)
    LIMIT 1
  `;
  if (!profile) return;
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
    type: "oss_verified", title: "PR merged — OSS verified",
    body: `Your PR in ${fullName} was merged${granted.length ? ` — badge earned: ${granted.join(", ")}` : ""}.`,
    link: "/student/opensource"
  });
}