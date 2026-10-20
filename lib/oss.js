// OSS contribution portal helpers: badge rules (pure/testable), PR URL parsing,
// and live GitHub repo metadata (used when admins curate a project).
export const OSS_BADGES = [
  { key: "first-pr", name: "First PR", desc: "First merged pull request in a tracked repo", needs: { verifiedPrs: 1 } },
  { key: "three-merged", name: "Triple Merge", desc: "3 merged pull requests in tracked repos", needs: { verifiedPrs: 3 } },
  { key: "five-merged", name: "OSS Regular", desc: "5 merged pull requests in tracked repos", needs: { verifiedPrs: 5 } },
  { key: "reviewer", name: "Code Reviewer", desc: "3 code reviews on tracked repos", needs: { reviews: 3 } }
];

export function earnedBadgeKeys({ verifiedPrs = 0, reviews = 0 } = {}) {
  return OSS_BADGES.filter((b) => {
    if (b.needs.verifiedPrs) return verifiedPrs >= b.needs.verifiedPrs;
    if (b.needs.reviews) return reviews >= b.needs.reviews;
    return false;
  }).map((b) => b.key);
}

// Accepts the URLs GitHub actually puts on the clipboard:
//   /pull/12, /pull/12/, /pull/12/files, /pull/12#discussion_r1, /issues/7
// All of those are one contribution, so the canonical form drops the suffix.
// Returns null for anything that is not a PR or issue link.
export function parseContributionUrl(url) {
  if (typeof url !== "string") return null;
  const m = url.trim().match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(pull|issues)\/(\d+)(?:[/#?][^\s]*)?$/i);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, "");
  const kind = m[3].toLowerCase() === "issues" ? "issue" : "pr";
  const number = Number(m[4]);
  return {
    owner,
    repo,
    kind,
    number,
    canonicalUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}/${
      kind === "issue" ? "issues" : "pull"
    }/${number}`
  };
}

export async function fetchRepoMeta({ owner, repo }) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "loom-app" }
    });
    if (!res.ok) return null;
    const r = await res.json();
    return {
      description: (r.description || "").slice(0, 500),
      language: r.language || null,
      stars: r.stargazers_count || 0,
      topics: Array.isArray(r.topics) ? r.topics.slice(0, 20) : [],
      homepage: r.homepage || null,
      pushedAt: r.pushed_at || null,
      defaultBranch: r.default_branch || null,
      forks: r.forks_count || 0,
      openIssues: r.open_issues_count || 0,
      isPrivate: Boolean(r.private),
      isFork: Boolean(r.fork)
    };
  } catch {
    return null;
  }
}

// Awards any newly-earned OSS badges. Returns the list of badge keys granted.
export async function awardOssBadges({ sql, studentId, tenantId, projectUrl }) {
  const [{ prs = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS prs FROM student_oss_contributions
    WHERE student_id = ${studentId} AND status = 'verified' AND contribution_type = 'pr'
  `;
  const [{ reviews = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS reviews FROM student_oss_contributions
    WHERE student_id = ${studentId} AND status = 'verified' AND contribution_type = 'review'
  `;
  const earned = earnedBadgeKeys({ verifiedPrs: prs, reviews });
  const granted = [];
  for (const key of earned) {
    const rows = await sql`
      INSERT INTO oss_badges (student_id, tenant_id, badge_key, project_url)
      VALUES (${studentId}, ${tenantId}, ${key}, ${projectUrl || null})
      ON CONFLICT (student_id, badge_key) DO NOTHING
      RETURNING badge_key
    `;
    if (rows.length) {
      granted.push(key);
      try {
        const { recordOssAchievement } = await import("./credentials.js");
        await recordOssAchievement({ sql, studentId, tenantId, badgeKey: key, projectUrl });
      } catch { /* achievements must never break badge awards */ }
    }
  }
  return granted;
}
