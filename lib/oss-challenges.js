// Read/write helpers for society open-source challenge submissions.
//
// Kept out of the route so the review queue, the student page, and the ranking
// test can share the exact same shape. Every query is tenant-scoped and
// sequential (AGENTS.md pooler rule).

import { normalizeDomainKey } from "@/lib/domains";
import { societyRepo } from "@/lib/society";
import { parseGitHubRepo } from "@/lib/ranking";

export const OSS_STATUS_LABEL = {
  submitted: "waiting for review",
  approved: "approved",
  rejected: "returned"
};

export const OSS_VERIFICATION_LABEL = {
  pending: "check pending",
  verified: "fork verified",
  error: "check unreliable",
  rejected: "fork rejected"
};

export function normalizeOssSubmission(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    domain: row.domain,
    repoFullName: row.repo_full_name,
    repoUrl: `https://github.com/${row.repo_full_name}`,
    projectId: row.project_id || null,
    forkUrl: row.fork_url,
    forkFullName: row.fork_full_name || null,
    note: row.note || "",
    status: row.status,
    verificationStatus: row.verification_status,
    verificationReason: row.verification_reason || null,
    reviewFeedback: row.review_feedback || "",
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
    studentName: row.student_name || null,
    studentId: row.user_id ? String(row.user_id) : null
  };
}

/** The member's own submissions, newest first. Degrades to none pre-migration. */
export async function loadMyOssSubmissions(sql, tenantId, userId, { domain = null } = {}) {
  if (!sql || !tenantId || !userId) return [];
  try {
    const rows = await sql`
      SELECT *
      FROM oss_challenge_submissions
      WHERE tenant_id = ${tenantId}::uuid
        AND user_id = ${userId}
        AND (${domain || null}::text IS NULL OR domain = ${domain || null})
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return rows.map(normalizeOssSubmission);
  } catch {
    return [];
  }
}

/** Oldest-first review queue for admins and matching domain leads. */
export async function loadOssSubmissionQueue(
  sql,
  tenantId,
  { domains = [], all = false, status = "submitted" } = {}
) {
  if (!sql || !tenantId) return [];
  if (!all && domains.length === 0) return [];
  try {
    const rows = all
      ? await sql`
          SELECT s.*, p.name AS student_name
          FROM oss_challenge_submissions s
          LEFT JOIN profiles p ON p.user_id = s.user_id AND p.tenant_id = s.tenant_id
          WHERE s.tenant_id = ${tenantId}::uuid
            AND s.status = ${status}
          ORDER BY s.created_at ASC
          LIMIT 100
        `
      : await sql`
          SELECT s.*, p.name AS student_name
          FROM oss_challenge_submissions s
          LEFT JOIN profiles p ON p.user_id = s.user_id AND p.tenant_id = s.tenant_id
          WHERE s.tenant_id = ${tenantId}::uuid
            AND s.status = ${status}
            AND s.domain = ANY(${domains})
          ORDER BY s.created_at ASC
          LIMIT 100
        `;
    return rows.map(normalizeOssSubmission);
  } catch {
    return [];
  }
}

/**
 * May this member submit a fork of `repoFullName` for `domain`?
 *
 * Two honest sources: the society repository itself (the challenge the chapter
 * owns) and any repository curated for this domain. Nothing else, so a member
 * cannot point the reviewer at an arbitrary fork with no domain meaning.
 */
export async function resolveChallengeRepo(sql, { tenantId, domain, repoFullName }) {
  const fullName = parseGitHubRepo(repoFullName) || parseGitHubRepo(`https://github.com/${repoFullName}`);
  if (!fullName) return null;
  if (fullName.toLowerCase() === societyRepo().toLowerCase()) {
    return { fullName, projectId: null, source: "society" };
  }
  const [owner, repo] = fullName.split("/");
  const [row] = await sql`
    SELECT id, owner, repo_name, primary_domain
    FROM open_source_projects
    WHERE (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
      AND is_active = true
      AND lower(owner) = lower(${owner})
      AND lower(repo_name) = lower(${repo})
      AND primary_domain = ${domain}
    LIMIT 1
  `;
  if (!row) return null;
  return { fullName: `${row.owner}/${row.repo_name}`, projectId: row.id, source: "curated" };
}

/** Repositories a member can choose on the submit form for one domain. */
export async function challengeRepoChoices(sql, tenantId, domain) {
  const choices = [{ fullName: societyRepo(), label: "Society challenge repo", source: "society" }];
  try {
    const rows = await sql`
      SELECT owner, repo_name, description
      FROM open_source_projects
      WHERE (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
        AND is_active = true
        AND primary_domain = ${domain}
      ORDER BY good_first_issues DESC NULLS LAST, stars DESC NULLS LAST
      LIMIT 6
    `;
    for (const row of rows) {
      const fullName = `${row.owner}/${row.repo_name}`;
      if (choices.some((choice) => choice.fullName.toLowerCase() === fullName.toLowerCase())) continue;
      choices.push({ fullName, label: row.description || fullName, source: "curated" });
    }
  } catch {
    // Pre-migration deployments still get the society repo.
  }
  return choices;
}

/** True when the value is a real track key; forgiving of stored display labels. */
export function challengeDomain(value) {
  return normalizeDomainKey(value);
}
