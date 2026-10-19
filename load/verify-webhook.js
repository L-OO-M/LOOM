// Checks whether GitHub ingestion is actually reaching LOOM. Read-only: the
// only request it makes is a signed `ping`, which the webhook acknowledges
// without storing anything, so verifying never pollutes the dashboard.
//
// Usage:
//   node load/verify-webhook.js           # report only, no network
//   node load/verify-webhook.js --ping    # also send a signed ping to production
//
// Requires GITHUB_WEBHOOK_URL and GITHUB_WEBHOOK_SECRET in env or .env.local.
// The deployment origin is derived from NEXT_PUBLIC_APP_URL rather than
// hardcoded, so pointing the app at a different domain needs no code change.
import { databaseUrl } from "./env-local.js";
import postgres from "postgres";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const URL = process.env.GITHUB_WEBHOOK_URL || `${appUrl}/api/webhook`;
const SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const sql = postgres(databaseUrl(), { max: 1, prepare: false });

const line = (s = "") => console.log(s);

try {
  line("\n1. Kill-switch");
  const flags = await sql`
    SELECT f.key, f.enabled, t.slug FROM feature_flags f
    JOIN tenants t ON t.id = f.tenant_id WHERE f.key = 'github_integration'`;
  for (const f of flags) {
    line(`   ${f.slug}: github_integration = ${f.enabled}`);
    if (!f.enabled) line("   -> ingestion is PAUSED; deliveries are acked and discarded");
  }

  line("\n2. Recent deliveries (last 7 days)");
  const ev = await sql`
    SELECT event_name, actor_login, received_at FROM github_events
    WHERE received_at > NOW() - INTERVAL '7 days'
    ORDER BY received_at DESC LIMIT 8`;
  if (!ev.length) {
    line("   none. If GitHub is sending, the deliveries are being rejected or");
    line("   not subscribed to these events. Check Settings -> Webhooks ->");
    line("   'Recent Deliveries' on GitHub and read the Response body.");
  } else {
    for (const e of ev) {
      line(`   ${e.received_at.toISOString().slice(0, 16)}  ${e.event_name.padEnd(22)} ${e.actor_login ?? "(no actor)"}`);
    }
  }

  line("\n3. Repositories seen (from stored payloads)");
  const repos = await sql`
    SELECT payload->'repository'->>'full_name' AS repo, COUNT(*)::int AS n
    FROM github_events WHERE payload->'repository'->>'full_name' IS NOT NULL
    GROUP BY 1 ORDER BY n DESC LIMIT 10`;
  if (repos.length) for (const r of repos) line(`   ${r.repo}  (${r.n} events)`);
  else line("   none");

  line("\n4. Members linked (activity is attributed by username)");
  const links = await sql`
    SELECT p.name, p.github_username, COALESCE(a.commits, 0)::int AS commits
    FROM profiles p
    LEFT JOIN student_daily_activity a
      ON a.student_id = p.user_id AND a.day = CURRENT_DATE
    WHERE p.github_username IS NOT NULL AND p.github_username <> ''
    ORDER BY p.name`;
  if (links.length) {
    for (const l of links) line(`   ${l.name.padEnd(20)} @${String(l.github_username).padEnd(20)} today: ${l.commits}`);
  } else {
    line("   nobody has linked a username yet — /student/github");
  }

  if (process.argv.includes("--ping")) {
    line("\n5. Signed ping against production (stores nothing)");
    if (!SECRET) {
      line("   SKIP  GITHUB_WEBHOOK_SECRET is not set locally");
    } else {
      const crypto = await import("node:crypto");
      const body = JSON.stringify({ zen: "verify-webhook" });
      const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
      const res = await fetch(URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "ping",
          "x-github-delivery": crypto.randomUUID(),
          "x-hub-signature-256": sig,
          "user-agent": "GitHub-Hookshot/verify"
        },
        body
      });
      const text = await res.text();
      line(`   ${res.status}  ${text.slice(0, 200)}`);
      line(res.status === 200
        ? "   -> routing, tenant resolution and signature all OK"
        : "   -> see docs/16 section 8 (troubleshooting)");
    }
  } else {
    line("\n5. Skipped network check (pass --ping to send a signed ping)");
  }
  line("");
} catch (e) {
  console.error("verify-webhook failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
