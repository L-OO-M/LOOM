// Dev-only database wipe. DANGEROUS. Refuses production.
// Usage: node load/wipe-dev.js --confirm [--full]
//   default : removes seed/dummy rows only (seed-user-*, seed-*, Seed titles, actor 'seed').
//             Real users, tenants, flags, and base content are preserved.
//   --full  : TRUNCATEs every data table (keeps schema + schema_migrations).
//             Auth users (auth schema) are untouched. Re-run base seeds after.
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* ignore */ }
}

async function main() {
  const args = process.argv.slice(2);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    console.error("wipe-dev refuses to run in production.");
    process.exit(1);
  }
  if (!args.includes("--confirm")) {
    console.error("Refusing without --confirm. Usage: node load/wipe-dev.js --confirm [--full]");
    process.exit(1);
  }
  const full = args.includes("--full");
  loadEnvLocal();
  const { default: postgres } = await import("postgres");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (checked env + .env.local).");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    if (!full) {
      const stmts = [
        "DELETE FROM public.contest_submissions WHERE student_id LIKE 'seed-user-%'",
        "DELETE FROM public.contest_registrations WHERE student_id LIKE 'seed-user-%'",
        "DELETE FROM public.notifications WHERE user_id LIKE 'seed-user-%'",
        "DELETE FROM public.projects WHERE owner_id LIKE 'seed-user-%'",
        "DELETE FROM public.github_events WHERE idempotency_key LIKE 'seed-%'",
        "DELETE FROM public.mentor_sessions WHERE student_id LIKE 'seed-user-%' OR mentor_id LIKE 'seed-user-%'",
        "DELETE FROM public.student_roadmap_progress WHERE student_id LIKE 'seed-user-%'",
        "DELETE FROM public.student_daily_activity WHERE student_id LIKE 'seed-user-%'",
        "DELETE FROM public.repositories WHERE id LIKE 'seed-repo-%'",
        "DELETE FROM public.github_connections WHERE user_id LIKE 'seed-user-%'",
        "DELETE FROM public.contests WHERE title LIKE 'Seed%'",
        "DELETE FROM public.mentors WHERE user_id LIKE 'seed-user-%'",
        "DELETE FROM public.profiles WHERE user_id LIKE 'seed-user-%'",
        "DELETE FROM public.audit_logs WHERE actor_id = 'seed'"
      ];
      for (const s of stmts) {
        const r = await sql.unsafe(s + " RETURNING 1").catch(() => sql.unsafe(s));
        console.log(`ok (${Array.isArray(r) ? r.length : "?"} rows): ${s.slice(0, 60)}...`);
      }
      console.log("seed wipe complete. Base content, tenants, flags, real users preserved.");
      return;
    }
    const tables = [
      "audit_logs", "notifications", "contest_submissions", "contest_registrations",
      "mentor_sessions", "mentors", "projects", "resource_progress",
      "student_roadmap_progress", "student_daily_activity", "github_events",
      "repositories", "github_connections", "contests", "resources",
      "roadmap_nodes", "profiles", "feature_flags",
      "tenant_domains", "platform_admins", "tenants"
    ];
    await sql.unsafe(`TRUNCATE TABLE ${tables.map((t) => `public.${t}`).join(", ")} RESTART IDENTITY CASCADE`);
    console.log("full wipe complete. schema_migrations preserved. Re-run: seed-control-plane, seed-content, then register via /setup.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
