import { fetchAuthenticatedUser, githubFetch } from "@/lib/github-oauth";
import { isAdmin, can, termExpired } from "@/lib/permissions";
import { parseGitHubRepo } from "@/lib/ranking";

export const DEBUG_DIFFICULTIES = ["beginner", "intermediate", "advanced"];

export function debugChallengeRepo() {
  const configured = String(process.env.DEBUG_CHALLENGE_REPO || "").trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(configured) ? configured : "L-OO-M/buggy";
}

export function parseForkUrl(value) {
  const fullName = parseGitHubRepo(value);
  if (!fullName) return null;
  const [owner, repo] = fullName.split("/");
  return {
    fullName,
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`
  };
}

function repoCreatedAt(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

export async function verifyForkOwnership({
  accessToken,
  forkFullName,
  challengeRepoFullName,
  challengePublishedAt,
  expectedOwner = null,
  fetchImpl = fetch
}) {
  if (!accessToken) {
    return {
      status: "error",
      reason: "Link your GitHub account before submitting a fork."
    };
  }
  const parsed = parseForkUrl(`https://github.com/${forkFullName}`);
  if (!parsed) {
    return { status: "rejected", reason: "Use a GitHub repository URL for your fork." };
  }

  const identity = await fetchAuthenticatedUser({ accessToken, fetchImpl });
  if (!identity.ok) {
    return {
      status: "error",
      reason: "GitHub could not confirm your linked identity. Re-link GitHub and try again."
    };
  }
  if (
    expectedOwner &&
    String(identity.login || "").toLowerCase() !== String(expectedOwner).toLowerCase()
  ) {
    return {
      status: "error",
      reason: "Your linked GitHub username no longer matches this token. Re-link GitHub and try again."
    };
  }
  const accountLogin = String(expectedOwner || identity.login);

  const repoResult = await githubFetch({
    path: `/repos/${parsed.fullName}`,
    accessToken,
    fetchImpl
  });
  if (!repoResult.ok) {
    if (repoResult.status === 404) {
      return { status: "rejected", reason: "That public GitHub repository was not found." };
    }
    return {
      status: "error",
      reason: "GitHub is unavailable right now. Your submission stays pending; try again shortly."
    };
  }

  const repo = repoResult.data;
  const owner = String(repo?.owner?.login || "");
  if (owner.toLowerCase() !== accountLogin.toLowerCase()) {
    return { status: "rejected", reason: "The fork must belong to your linked GitHub account." };
  }
  if (repo?.private === true) {
    return { status: "rejected", reason: "The fork must be public so the reviewing lead can inspect it." };
  }
  if (repo?.fork !== true) {
    return { status: "rejected", reason: "Submit a fork of the challenge repository, not an original repository." };
  }
  if (
    challengeRepoFullName &&
    String(repo?.parent?.full_name || "").toLowerCase() !== String(challengeRepoFullName).toLowerCase()
  ) {
    return { status: "rejected", reason: "The repository is not a fork of the challenge repository." };
  }

  const createdAt = repoCreatedAt(repo?.created_at);
  if (challengePublishedAt && (!createdAt || createdAt < challengePublishedAt)) {
    return { status: "rejected", reason: "The fork was created before this challenge was published." };
  }

  const commits = await githubFetch({
    path: `/repos/${parsed.fullName}/commits?author=${encodeURIComponent(accountLogin)}&per_page=1`,
    accessToken,
    fetchImpl
  });
  if (!commits.ok) {
    if (commits.status === 409) {
      return { status: "rejected", reason: "The fork has no commits by your linked GitHub account yet." };
    }
    if (commits.status === 403 || commits.status === 429) {
      return {
        status: "error",
        reason: "GitHub is rate limiting checks. Your submission stays pending; try again shortly."
      };
    }
    return {
      status: "error",
      reason: "GitHub could not check your commits. Your submission stays pending; try again shortly."
    };
  }
  if (!Array.isArray(commits.data) || commits.data.length === 0) {
    return { status: "rejected", reason: "The fork has no commits by your linked GitHub account yet." };
  }

  return {
    status: "verified",
    reason: null,
    repoId: Number(repo.id) || null,
    fullName: String(repo.full_name || parsed.fullName),
    owner: String(owner),
    createdAt
  };
}

export function reviewScopes(profile) {
  if (isAdmin(profile)) return { all: true, domains: [] };
  const domains = [];
  for (const membership of profile?.memberships || []) {
    if (membership.level !== "dept_lead") continue;
    if (termExpired(membership.term_end)) continue;
    const allowed = can(profile, "log_contribution", { departmentId: membership.department_id });
    if (allowed.ok && membership.slug) domains.push(membership.slug);
  }
  return { all: false, domains: [...new Set(domains)] };
}

export function canReviewDebugDomain(profile, domain) {
  const scope = reviewScopes(profile);
  return scope.all || scope.domains.includes(domain);
}

function normalizeChallenge(row) {
  return {
    id: String(row.id),
    slug: row.slug,
    title: row.title,
    domain: row.domain,
    difficulty: row.difficulty,
    repoPath: row.repo_path,
    brief: row.brief || "",
    verification: row.verification || "",
    isPublished: row.is_published === true,
    publishedAt: row.published_at ? new Date(row.published_at).getTime() : null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null
  };
}

function normalizeSubmission(row) {
  return {
    id: String(row.id),
    challengeId: String(row.challenge_id),
    userId: String(row.user_id),
    studentName: row.student_name || "Member",
    challengeTitle: row.challenge_title,
    challengeSlug: row.challenge_slug,
    domain: row.domain,
    forkUrl: row.fork_url,
    forkFullName: row.fork_full_name,
    prUrl: row.pr_url,
    verificationStatus: row.verification_status,
    verificationReason: row.verification_reason,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).getTime() : null,
    reviewStatus: row.review_status,
    reviewFeedback: row.review_feedback || "",
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null
  };
}

export async function loadDebugCatalogue(sql, tenantId, { publishedOnly = false } = {}) {
  const rows = publishedOnly
    ? await sql`
        SELECT *
        FROM debug_challenges
        WHERE tenant_id = ${tenantId}::uuid
          AND is_published = true
        ORDER BY domain ASC, difficulty ASC, title ASC
      `
    : await sql`
        SELECT *
        FROM debug_challenges
        WHERE tenant_id = ${tenantId}::uuid
        ORDER BY is_published DESC, domain ASC, difficulty ASC, title ASC
      `;
  return rows.map(normalizeChallenge);
}

export async function loadDebugChallenge(sql, tenantId, slug, { publishedOnly = true } = {}) {
  const [row] = publishedOnly
    ? await sql`
        SELECT *
        FROM debug_challenges
        WHERE tenant_id = ${tenantId}::uuid
          AND slug = ${slug}
          AND is_published = true
        LIMIT 1
      `
    : await sql`
        SELECT *
        FROM debug_challenges
        WHERE tenant_id = ${tenantId}::uuid
          AND slug = ${slug}
        LIMIT 1
      `;
  return row ? normalizeChallenge(row) : null;
}

export async function loadMyDebugSubmissions(sql, tenantId, userId) {
  const rows = await sql`
    SELECT s.*, c.title AS challenge_title, c.slug AS challenge_slug, c.domain,
           p.name AS student_name
    FROM debug_submissions s
    JOIN debug_challenges c ON c.id = s.challenge_id AND c.tenant_id = s.tenant_id
    JOIN profiles p ON p.user_id = s.user_id AND p.tenant_id = s.tenant_id
    WHERE s.tenant_id = ${tenantId}::uuid
      AND s.user_id = ${userId}
    ORDER BY s.created_at DESC
  `;
  return rows.map(normalizeSubmission);
}

export async function loadDebugQueue(
  sql,
  tenantId,
  { domains = [], all = false, statuses = ["submitted"] } = {}
) {
  if (!all && domains.length === 0) return [];
  const rows = all
    ? await sql`
        SELECT s.*, c.title AS challenge_title, c.slug AS challenge_slug, c.domain,
               p.name AS student_name
        FROM debug_submissions s
        JOIN debug_challenges c ON c.id = s.challenge_id AND c.tenant_id = s.tenant_id
        JOIN profiles p ON p.user_id = s.user_id AND p.tenant_id = s.tenant_id
        WHERE s.tenant_id = ${tenantId}::uuid
          AND s.review_status = ANY(${statuses})
        ORDER BY s.created_at ASC
      `
    : await sql`
        SELECT s.*, c.title AS challenge_title, c.slug AS challenge_slug, c.domain,
               p.name AS student_name
        FROM debug_submissions s
        JOIN debug_challenges c ON c.id = s.challenge_id AND c.tenant_id = s.tenant_id
        JOIN profiles p ON p.user_id = s.user_id AND p.tenant_id = s.tenant_id
        WHERE s.tenant_id = ${tenantId}::uuid
          AND s.review_status = ANY(${statuses})
          AND c.domain = ANY(${domains})
        ORDER BY s.created_at ASC
      `;
  return rows.map(normalizeSubmission);
}

export async function loadDebugAdminSnapshot(sql, tenantId) {
  const challenges = await loadDebugCatalogue(sql, tenantId);
  const rows = await sql`
    SELECT s.*, c.title AS challenge_title, c.slug AS challenge_slug, c.domain,
           p.name AS student_name
    FROM debug_submissions s
    JOIN debug_challenges c ON c.id = s.challenge_id AND c.tenant_id = s.tenant_id
    JOIN profiles p ON p.user_id = s.user_id AND p.tenant_id = s.tenant_id
    WHERE s.tenant_id = ${tenantId}::uuid
    ORDER BY s.created_at DESC
    LIMIT 100
  `;
  return { challenges, submissions: rows.map(normalizeSubmission) };
}
