// Read-only schema/ledger status. Answers one question without changing
// anything: "is this database actually at the migrations this code expects?"
//
// Usage:
//   node --import ./load/env-local.js load/schema-status.js
//   DATABASE_URL_TARGET=postgres://... node --import ./load/env-local.js load/schema-status.js
//
// `load/migrate.js` prints what it WOULD apply; this prints what a database can
// prove it has already applied, plus the objects the newest migrations own. Run
// it against a production connection before deploying code that depends on new
// migrations, and again after a migration to confirm the ledger moved.
//
// Never prints a secret: only counts, file names, and object names.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DIR = fileURLToPath(new URL("./migrations", import.meta.url));

// Objects that the most recent migrations own. If the ledger says a migration
// ran but its object is missing, the ledger and the schema disagree — the case
// that silently breaks a deploy at runtime instead of at build time.
const EXPECTED = [
  { migration: "057_contest_judging.sql", table: "contest_submissions", columns: ["status", "score", "judged_at"] },
  { migration: "060_consent_records.sql", table: "consent_records", columns: ["terms_version", "privacy_version"] },
  { migration: "062_webhook_processed_state.sql", table: "github_events", columns: ["status", "attempts", "activity_applied_at"] },
  { migration: "062_webhook_processed_state.sql", table: "notifications", columns: ["dedupe_key"] },
  { migration: "063_report_revisions.sql", table: "report_revisions", columns: ["report_id", "revision", "draft"] },
  { migration: "064_username_change_limits.sql", table: "user_profiles", columns: ["username_changed_at", "username_change_count"] }
];

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 5 });

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

try {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

  const ledgerExists = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'schema_migrations' LIMIT 1`;
  if (!ledgerExists.length) {
    console.error("FAIL  schema_migrations does not exist — this database has never been migrated");
    process.exit(1);
  }

  const ledger = (await sql`SELECT name, applied_at FROM schema_migrations ORDER BY name`).map((r) => r.name);
  const ledgerSet = new Set(ledger);
  const fileSet = new Set(files);

  const pending = files.filter((f) => !ledgerSet.has(f));
  const orphaned = ledger.filter((f) => !fileSet.has(f));

  console.log(`ledger: ${ledger.length} applied | disk: ${files.length} migrations`);
  console.log(`newest applied: ${ledger[ledger.length - 1] ?? "(none)"}`);
  if (pending.length) {
    console.log(`pending (${pending.length}): ${pending.join(", ")}`);
    fail(`${pending.length} migration file(s) are not applied to this database`);
  } else {
    console.log("pending: none");
  }
  if (orphaned.length) {
    // A renamed/removed file leaves history behind; harmless if it was a
    // renumbering (036 -> 036b), suspicious otherwise.
    console.log(`ledger rows with no file on disk: ${orphaned.join(", ")}`);
  }

  const columns = await sql`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
  const tables = new Set(
    (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`).map((r) => r.table_name)
  );
  const columnSet = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`));

  let objectProblems = 0;
  for (const check of EXPECTED) {
    if (!tables.has(check.table)) {
      // Only a problem when the owning migration claims to be applied.
      if (ledgerSet.has(check.migration)) {
        fail(`${check.migration} is in the ledger but table ${check.table} is missing`);
        objectProblems++;
      }
      continue;
    }
    const missing = check.columns.filter((c) => !columnSet.has(`${check.table}.${c}`));
    if (missing.length && ledgerSet.has(check.migration)) {
      fail(`${check.migration} is in the ledger but ${check.table} lacks: ${missing.join(", ")}`);
      objectProblems++;
    }
  }
  if (!objectProblems) console.log("recent objects: all present");

  console.log(process.exitCode ? "STATUS: NOT READY" : "STATUS: up to date");
} catch (error) {
  console.error("schema-status failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
