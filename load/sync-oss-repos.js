// Refresh catalogue metadata from GitHub.
//
// Curated rows are editorial; stars, language, topics, last push and the count
// of open `good first issue` labels are facts that drift. This script refreshes
// those facts and records `metadata_synced_at` so the UI can say when it last
// checked instead of implying live data forever.
//
// Usage:
//   node load/sync-oss-repos.js                  # dry run, 10 repos
//   node load/sync-oss-repos.js --apply
//   node load/sync-oss-repos.js --apply --limit 50
//   node load/sync-oss-repos.js --apply --domain ai_ml
//
// A token is optional but recommended: unauthenticated GitHub allows 60
// requests/hour, and good-first-issue counts require the search API.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const apply = process.argv.includes("--apply");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const limit = Math.min(Math.max(Number(arg("--limit")) || 10, 1), 200);
const domain = arg("--domain");
const token = process.env.GITHUB_ISSUES_TOKEN || process.env.GITHUB_TOKEN || "";

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "loom-oss-sync",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function repoMeta(owner, repo) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function goodFirstIssues(owner, repo) {
  if (!token) return null;
  try {
    const q = encodeURIComponent(`repo:${owner}/${repo} is:issue is:open label:"good first issue"`);
    const res = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=1`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return Number.isFinite(data.total_count) ? data.total_count : null;
  } catch {
    return null;
  }
}

const sql = postgres(databaseUrl(), { max: 1, prepare: false });

try {
  const rows = await sql`
    SELECT id, owner, repo_name, github_repo_url, primary_domain
    FROM open_source_projects
    WHERE is_active
      AND (${domain}::text IS NULL OR primary_domain = ${domain})
    ORDER BY stars DESC, owner ASC
    LIMIT ${limit}
  `;
  console.log(
    `OSS META SYNC ${apply ? "(applying)" : "(dry run)"} | github: ${token ? "authenticated" : "anonymous"} | ${rows.length} repo(s)`
  );

  let updated = 0;
  for (const row of rows) {
    const meta = await repoMeta(row.owner, row.repo_name);
    if (!meta) {
      console.log(`- ${row.owner}/${row.repo_name} -> lookup failed`);
      continue;
    }
    const gfi = await goodFirstIssues(row.owner, row.repo_name);
    if (token) await sleep(2100);
    const summary = `${meta.language || "mixed"} | ${meta.stargazers_count ?? 0} stars | ${gfi ?? "unknown"} GFI`;
    if (!apply) {
      console.log(`- ${row.owner}/${row.repo_name} -> ${summary}`);
      continue;
    }
    await sql`
      UPDATE open_source_projects SET
        description = COALESCE(${String(meta.description || "").slice(0, 500)}, description),
        language = ${meta.language || null},
        stars = ${Number(meta.stargazers_count) || 0},
        topics = ${Array.isArray(meta.topics) ? meta.topics : []},
        homepage = ${meta.homepage || null},
        contributing_url = ${`https://github.com/${row.owner}/${row.repo_name}/blob/${meta.default_branch || "main"}/CONTRIBUTING.md`},
        pushed_at = ${meta.pushed_at || null},
        good_first_issues = ${gfi ?? 0},
        metadata_synced_at = NOW()
      WHERE id = ${row.id}
    `;
    updated += 1;
    console.log(`- ${row.owner}/${row.repo_name} -> ${summary}`);
  }
  if (apply) console.log(`Updated ${updated} of ${rows.length} repositories.`);
} finally {
  await sql.end();
}
