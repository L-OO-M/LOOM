// READ-ONLY production preflight for the roadmap resource shelf.
//
// Answers one question: is the schema and data that /student/roadmap depends
// on actually present in THIS database? Safe to run against production — it
// issues SELECTs only, writes nothing, and never prints the connection string.
//
// Usage:
//   DATABASE_URL=... node load/verify-roadmap-shelf.js
//   DATABASE_URL=... DATABASE_APP_URL=... node load/verify-roadmap-shelf.js
//   (falls back to .env.local only when DATABASE_URL is unset, and says so)
//
// Exit codes: 0 = ready to deploy, 1 = blocker found (with the exact remedy).
//
// This is deliberately NOT wired into the Vercel build. Preview and production
// builds must never migrate a shared database; verification is an explicit,
// human-invoked step before promoting a release.
const fs = require("fs");
const path = require("path");

async function main() {
  let fromEnvFile = false;
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim();
        // Only DATABASE_URL changes where this script looks; other keys
        // falling back is unremarkable.
        if (m[1] === "DATABASE_URL") fromEnvFile = true;
      }
    }
  } catch { /* env only */ }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Pass the production URL explicitly:");
    console.error("  DATABASE_URL=... node load/verify-roadmap-shelf.js");
    process.exit(1);
  }

  const { default: postgres } = await import("postgres");
  let host = "(unparsed)";
  try { host = new URL(url).host; } catch { /* keep placeholder */ }
  console.log(`verifying: ${host}${fromEnvFile ? " (DATABASE_URL came from .env.local)" : ""}`);
  console.log("mode: READ-ONLY (SELECT only — no writes are performed)\n");

  const sql = postgres(url, { max: 1, connect_timeout: 20, readonly: true });
  const blockers = [];
  const notes = [];
  const ok = (label, value) => console.log(`  OK    ${label}: ${value}`);
  const bad = (label, remedy) => {
    console.log(`  BLOCK ${label}`);
    for (const line of remedy) console.log(`          ${line}`);
    blockers.push(label);
  };

  try {
    // 1. Is the connection the one we think it is?
    const [who] = await sql`SELECT current_database() AS db, current_user AS usr`;
    ok("connected", `${who.db} as ${who.usr}`);
    if (!who.db) {
      console.error("  BLOCK could not identify the target database");
      process.exit(1);
    }

    // 2. Does the table the deployed code queries exist?
    const [table] = await sql`SELECT to_regclass('public.roadmap_node_resources')::text AS t`;
    if (!table.t) {
      bad("public.roadmap_node_resources is missing", [
        "Run the tracked migrations against THIS database:",
        "  node load/migrate.js",
        "Until it exists, /student/roadmap and /student/roadmap/[nodeId] fail",
        "with 'relation \"roadmap_node_resources\" does not exist'.",
      ]);
      return finish(sql, blockers, notes);
    }
    ok("table public.roadmap_node_resources", "present");

    // 3. Is migration 036 recorded (so re-running migrate is a no-op)?
    const [mig] = await sql`
      SELECT count(*)::int AS n FROM public.schema_migrations
      WHERE name = '036_roadmap_node_resources.sql'`;
    if (mig.n === 0) {
      notes.push("036 is not recorded in schema_migrations — the table may have been created by hand; run `node load/migrate.js` to record it (the SQL is IF NOT EXISTS, so this is safe)");
    } else {
      ok("migration 036 recorded", "yes");
    }

    // 4. Is it populated?
    const [rows] = await sql`SELECT count(*)::int AS n FROM roadmap_node_resources`;
    if (rows.n === 0) {
      bad("roadmap_node_resources is empty", [
        "Every canonical node renders an empty 'Study this' shelf. Populate it:",
        "  node load/seed-node-resources.js",
        "(requires canonical nodes/resources — run load/seed-roadmaps.js first if missing)",
      ]);
      return finish(sql, blockers, notes);
    }
    ok("mappings present", rows.n);

    // 5. Integrity: no orphans, no duplicates.
    const [orphans] = await sql`
      SELECT count(*)::int AS n FROM roadmap_node_resources m
      WHERE NOT EXISTS (SELECT 1 FROM roadmap_nodes n WHERE n.id = m.node_id)
         OR NOT EXISTS (SELECT 1 FROM resources r WHERE r.id = m.resource_id)`;
    if (orphans.n > 0) bad(`${orphans.n} orphan mapping(s)`, ["Re-run: node load/seed-node-resources.js"]);

    const [dupes] = await sql`
      SELECT count(*)::int AS n FROM (
        SELECT node_id, resource_id FROM roadmap_node_resources
        GROUP BY node_id, resource_id HAVING COUNT(*) > 1) d`;
    if (dupes.n > 0) bad(`${dupes.n} duplicate node/resource pair(s)`, ["Re-run: node load/seed-node-resources.js"]);

    // 6. Coverage: every node has at least one mapped resource with a URL.
    const [coverage] = await sql`
      SELECT
        (SELECT count(*)::int FROM roadmap_nodes) AS nodes,
        (SELECT count(DISTINCT m.node_id)::int FROM roadmap_node_resources m) AS mapped,
        (SELECT count(*)::int FROM (
           SELECT m.node_id FROM roadmap_node_resources m
           JOIN resources r ON r.id = m.resource_id
           WHERE r.url IS NOT NULL AND btrim(r.url) <> ''
           GROUP BY m.node_id) x) AS usable`;
    ok("node coverage", `${coverage.mapped}/${coverage.nodes} nodes mapped, ${coverage.usable} with a usable URL`);
    if (coverage.usable < coverage.nodes) {
      notes.push(
        `${coverage.nodes - coverage.usable} node(s) have no usable resource — they render the honest empty state, not an error.`
      );
    }

    // 7. Can the APP role read it? DATABASE_APP_URL runs as loom_app
    //    (NOBYPASSRLS). A missing default-privilege grant fails at runtime.
    const appUrl = process.env.DATABASE_APP_URL;
    if (!appUrl) {
      notes.push("DATABASE_APP_URL not set — skipped the application-role permission check");
    } else {
      let appHost = "(unparsed)";
      try { appHost = new URL(appUrl).host; } catch { /* keep placeholder */ }
      try {
        const app = postgres(appUrl, { max: 1, connect_timeout: 20, readonly: true });
        try {
          const r = await app`SELECT count(*)::int AS n FROM public.roadmap_node_resources`;
          ok(`application role can SELECT (${appHost})`, `${r[0].n} rows visible`);
        } finally {
          await app.end();
        }
      } catch (e) {
        bad("application role cannot read roadmap_node_resources", [
          `SELECT as the app role failed: ${e.message}`,
          "The table inherits grants from migration 030's ALTER DEFAULT PRIVILEGES.",
          "If this database predates that, grant explicitly (once, as owner):",
          "  GRANT SELECT ON public.roadmap_node_resources TO loom_app;",
        ]);
      }
    }
  } finally {
    await finish(sql, blockers, notes);
  }
}

async function finish(sql, blockers, notes) {
  try {
    await sql.end();
  } catch { /* already closed */ }
  if (notes.length) {
    console.log("\nnotes:");
    for (const n of notes) console.log(`  - ${n}`);
  }
  if (blockers.length) {
    console.log(`\nRESULT: NOT READY — ${blockers.length} blocker(s). Fix the above before deploying.`);
    process.exit(1);
  }
  console.log("\nRESULT: READY — schema and data verified. This database can serve the roadmap pages.");
}

main().catch((e) => {
  console.error("verification could not complete:", e.message);
  process.exit(1);
});