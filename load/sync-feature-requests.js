// Backfill GitHub Issues for feature requests created before the bridge was
// configured. New submissions sync automatically; existing rows do not, and the
// admin board only exposes them one at a time.
//
// Idempotent: only rows with github_issue_number IS NULL are touched, and the
// sync helper records the created issue (with its hidden marker) on the row.
//
// Usage:
//   node load/sync-feature-requests.js                 # dry run
//   node load/sync-feature-requests.js --apply         # create issues
//   node load/sync-feature-requests.js --apply --tenant demo-college
//   node load/sync-feature-requests.js --apply --limit 50
//   node load/sync-feature-requests.js --refresh       # pull state/status from GitHub
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";
import { issuesConfig, syncFeatureRequestToGitHub } from "../lib/github-issues.js";

const apply = process.argv.includes("--apply");
const refresh = process.argv.includes("--refresh");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const tenantSlug = arg("--tenant");
const limit = Math.min(Math.max(Number(arg("--limit")) || 100, 1), 500);

const cfg = issuesConfig();
if (!cfg.configured) {
  console.error(
    "GitHub Issues is not configured. Set GITHUB_ISSUES_REPO (owner/repo) and " +
    "GITHUB_ISSUES_TOKEN (>= 20 chars) in the environment or .env.local."
  );
  process.exit(1);
}

const sql = postgres(databaseUrl(), { max: 1, prepare: false });

try {
  const rows = await sql`
    SELECT fr.*, p.name AS requester_name, t.name AS tenant_name
    FROM feature_requests fr
    LEFT JOIN profiles p ON p.user_id = fr.requester_id
    LEFT JOIN tenants t ON t.id = fr.tenant_id
    WHERE ${refresh ? sql`fr.github_issue_number IS NOT NULL` : sql`fr.github_issue_number IS NULL`}
      AND (${tenantSlug}::text IS NULL OR t.slug = ${tenantSlug})
    ORDER BY fr.created_at ASC
    LIMIT ${limit}
  `;

  console.log(
    refresh
      ? `FEATURE REQUEST REFRESH ${apply ? "(applying)" : "(dry run - pass --apply to update)"}`
      : `FEATURE REQUEST SYNC ${apply ? "(applying)" : "(dry run - pass --apply to create issues)"}`
  );
  console.log(`repo: ${cfg.repo} | ${refresh ? "linked" : "unlinked"}: ${rows.length}`);

  let created = 0;
  for (const row of rows) {
    const label = `${row.id} | ${row.status} | ${row.title}`;
    if (!apply) {
      console.log(`- ${label} -> would ${refresh ? "refresh from GitHub" : "create an issue"}`);
      continue;
    }
    const result = await syncFeatureRequestToGitHub({
      sql,
      row,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    });
    if (result.ok) {
      if (!refresh) created += 1;
      const changed = result.row?.status && result.row.status !== row.status
        ? ` | status ${row.status} -> ${result.row.status}`
        : "";
      console.log(
        `- ${label} -> #${result.row?.github_issue_number} ${result.row?.github_issue_state || ""}${changed}`
      );
    } else {
      console.log(`- ${label} -> ${result.code}: ${result.message}`);
    }
  }

  if (apply) console.log(refresh ? `Refreshed ${rows.length} linked issue(s).` : `Created ${created} of ${rows.length} issue(s).`);
} finally {
  await sql.end();
}
