// Wipe every member account and everything those accounts generated, while
// keeping the chapter itself intact.
//
// Keeps: tenant(s), tenant_domains, chapter_profiles, departments (with head
// pointers cleared), roadmap nodes/edges/resources, roadmap_node_resources,
// practice_questions, practice_weeks, planner_weeks, planner_sessions (chapter
// curriculum: every row has owner_user_id NULL), faqs, open_source_projects,
// events (with created_by cleared), contests, debug_challenges, skill_badges,
// asset_categories, feature_flags, schema_migrations.
//
// Deletes: profiles, Supabase auth.users, platform_admins, user_identities,
// user_profiles, and every row those members authored or produced -- GitHub
// proof, credentials, projects, progress, memberships, notifications, consent,
// audit/analytics, forum/wiki/announcements/feature requests, department
// reports, mentor records, event registrations.
//
// Usage:
//   node load/wipe-members.mjs             # dry run: same deletes, rolls back
//   node load/wipe-members.mjs --confirm   # commits
//   node load/wipe-members.mjs --auth0     # dry run of the Auth0 user list
//   node load/wipe-members.mjs --auth0 --confirm   # deletes Auth0 users
//
// `--auth0` talks to the Auth0 Management API and never touches Postgres.
// `--confirm` is required for any write, in both modes.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const CONFIRM = process.argv.includes("--confirm");
const AUTH0_MODE = process.argv.includes("--auth0");

// Order matters only for foreign keys. Children before parents; profiles last so
// every RESTRICT/SET NULL rule sees an already-empty child table.
const DELETE_ORDER = [
  // analytics + activity logs
  "credential_views",
  "page_views",
  "roadmap_node_analytics",
  "audit_logs",
  "notifications",
  "outbox",
  // credentials + proof of work
  "verifiable_credentials",
  "certificates",
  "student_achievements",
  "oss_badges",
  "proof_reviews",
  // GitHub integration
  "github_events",
  "github_repo_grants",
  "github_connections",
  "repositories",
  // projects
  "project_members",
  "project_milestones",
  "projects",
  // learning progress
  "student_roadmap_progress",
  "resource_progress",
  "student_tracks",
  "student_daily_activity",
  "student_analytics_snapshots",
  "student_oss_contributions",
  "ranking_events",
  "ranking_scores",
  "member_contributions",
  "people_checklist_items",
  // practice
  "practice_solves",
  "practice_attempts",
  "practice_corrections",
  "practice_sessions",
  "practice_connections",
  "practice_sync_runs",
  // contests + challenges
  "contest_registrations",
  "contest_submissions",
  "debug_submissions",
  "oss_challenge_submissions",
  // mentorship
  "mentor_messages",
  "mentor_reviews",
  "mentor_availability",
  "mentor_effectiveness",
  "mentor_sessions",
  "mentor_applications",
  "mentors",
  "helper_profiles",
  // chapter people + governance
  "department_memberships",
  "leadership_terms",
  "lead_directory",
  "lead_handovers",
  "handover_checklists",
  "consent_records",
  // events (the calendar itself stays)
  "event_registrations",
  "event_ops_tasks",
  "event_materials",
  "volunteer_signups",
  "volunteer_slots",
  // community content authored by members
  "forum_votes",
  "forum_flags",
  "forum_replies",
  "forum_threads",
  "feature_request_comments",
  "feature_requests",
  "code_snippets",
  "wiki_edit_requests",
  "wiki_pages",
  "announcements",
  // department reports
  "report_revisions",
  "dept_reports",
  // social
  "followers",
  "user_endorsements",
  "identity_links",
  // help board
  "help_matches",
  "help_signals",
  // identity (profiles + auth.users are last)
  "email_verification_tokens",
  "user_profiles",
  "user_identities",
  "platform_admins",
  "profiles"
];

// Chapter-owned rows whose author pointer would otherwise dangle.
const NULL_OUT = [
  ["departments", "head_user_id"],
  ["departments", "co_head_user_id"],
  ["events", "created_by"],
  ["faqs", "created_by"],
  ["open_source_projects", "created_by"],
  ["practice_weeks", "created_by"],
  ["planner_sessions", "owner_user_id"]
];

function loadAuth0Env() {
  for (const file of [".env.local", ".env.production.local"]) {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      }
    } catch {
      /* file absent -- rely on the process environment */
    }
  }
}

async function auth0Token(domain, scope) {
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
      client_secret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
      audience: `https://${domain}/api/v2/`,
      scope
    })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Auth0 token request failed: ${body.error || res.status}`);
  return body.access_token;
}

async function listAuth0Users(domain, token) {
  const users = [];
  for (let page = 0; page < 100; page += 1) {
    const res = await fetch(
      `https://${domain}/api/v2/users?per_page=100&page=${page}` +
        "&fields=user_id,email,name,created_at,last_login,identities",
      { headers: { authorization: `Bearer ${token}` } }
    );
    const body = await res.json();
    if (!res.ok) throw new Error(`Auth0 user list failed: ${body.message || res.status}`);
    users.push(...body);
    if (body.length < 100) break;
  }
  return users;
}

async function wipeAuth0() {
  loadAuth0Env();
  const domain = String(process.env.AUTH0_MANAGEMENT_DOMAIN || process.env.AUTH0_DOMAIN || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!domain) throw new Error("AUTH0_DOMAIN is not set.");
  if (!process.env.AUTH0_MANAGEMENT_CLIENT_ID || !process.env.AUTH0_MANAGEMENT_CLIENT_SECRET) {
    throw new Error("AUTH0_MANAGEMENT_CLIENT_ID / AUTH0_MANAGEMENT_CLIENT_SECRET are not set.");
  }

  console.log(`Auth0 tenant: ${domain}`);
  const token = await auth0Token(domain, "read:users");
  const users = await listAuth0Users(domain, token);
  console.log(`Auth0 users: ${users.length}`);
  for (const u of users) {
    console.log(`  ${u.user_id}  ${u.email ?? "(no email)"}  last_login=${(u.last_login || "never").slice(0, 10)}`);
  }

  if (!users.length) {
    console.log("\nNothing to delete.");
    return;
  }
  if (!CONFIRM) {
    console.log("\nDry run. Re-run with --auth0 --confirm to delete these users.");
    return;
  }

  // Deletion needs delete:users; request a fresh token with the wider scope.
  const writeToken = await auth0Token(domain, "read:users delete:users");
  let deleted = 0;
  const failures = [];
  for (const u of users) {
    const res = await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(u.user_id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${writeToken}` }
    });
    if (res.ok) deleted += 1;
    else failures.push(`${u.user_id} -> ${res.status}`);
  }
  console.log(`\nDeleted ${deleted} of ${users.length} Auth0 users.`);
  if (failures.length) {
    console.error("Failures:");
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}

async function wipeDatabase() {
  const url = new URL(databaseUrl());
  const sql = postgres(databaseUrl(), { max: 2, prepare: false, onnotice: () => {} });

  try {
    const [{ db, usr, tenant }] = await sql`
      SELECT current_database() AS db, current_user AS usr,
             (SELECT slug FROM public.tenants ORDER BY created_at LIMIT 1) AS tenant
    `;
    console.log(`Target database : ${url.hostname} / ${db} (user ${usr})`);
    console.log(`Chapter         : ${tenant ?? "(none)"}`);
    console.log(`Mode            : ${CONFIRM ? "COMMIT" : "dry run (rolls back)"}\n`);

    let dryRun = false;
    const counts = {};

    await sql.begin(async (tx) => {
      for (const table of DELETE_ORDER) {
        const result = await tx.unsafe(`DELETE FROM public."${table}"`);
        counts[table] = result.count;
      }

      for (const [table, column] of NULL_OUT) {
        await tx.unsafe(`UPDATE public."${table}" SET "${column}" = NULL WHERE "${column}" IS NOT NULL`);
      }

      // Chapter stats are computed from member rows, so they must be recomputed
      // after the wipe or the public chapter card keeps advertising ghost members.
      await tx.unsafe(`
        UPDATE public.chapter_profiles c
        SET public_stats = jsonb_build_object(
              'members', (SELECT COUNT(*)::int FROM public.profiles p WHERE p.tenant_id = c.tenant_id),
              'oss_contributions', (SELECT COUNT(*)::int FROM public.student_oss_contributions o
                                    WHERE o.tenant_id = c.tenant_id AND o.status = 'verified')
            ),
            updated_at = now()
      `);

      // Supabase auth rows last: this revokes every live session and cascades
      // through auth.identities / auth.sessions / auth.refresh_tokens.
      const authResult = await tx.unsafe("DELETE FROM auth.users");
      counts["auth.users"] = authResult.count;

      if (!CONFIRM) {
        dryRun = true;
        throw new Error("__DRY_RUN__");
      }
    }).catch((error) => {
      if (!dryRun || error.message !== "__DRY_RUN__") throw error;
    });

    const rows = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([table, n]) => ({ table, deleted: n }));
    console.log("Rows " + (CONFIRM ? "deleted" : "that would be deleted") + ":");
    console.table(rows);
    console.log(`Total rows: ${rows.reduce((sum, r) => sum + r.deleted, 0)}`);

    if (!CONFIRM) {
      console.log("\nDry run complete. Transaction rolled back; nothing changed.");
      console.log("Re-run with --confirm to apply.");
    } else {
      console.log("\nCommitted.");
    }
  } finally {
    await sql.end();
  }
}

if (AUTH0_MODE) await wipeAuth0();
else await wipeDatabase();
