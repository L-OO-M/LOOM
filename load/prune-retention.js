// Retention pruning: deletes rows older than a per-table window.
//
// WHY THIS EXISTS
// No table in this schema had any cleanup path. `github_events` stores the FULL
// raw payload of every delivery and grows on every webhook; `audit_logs` grows
// on every audited mutation; `notifications` are only ever marked read, never
// deleted. Docs 16 admitted the gap ("set a pruning policy before the table
// grows") and nothing ever did. On a long-lived deployment those three alone
// grow without bound.
//
// Usage:
//   node load/prune-retention.js            # dry run: report counts, delete nothing
//   node load/prune-retention.js --apply    # actually delete
//   node load/prune-retention.js --apply --days 180
//
// Requires DATABASE_URL (owner) in env or .env.local. The owner connection is
// required on purpose: most of these tables have tenant RLS enabled, and a
// scoped connection would only be able to delete its own tenant's rows, which
// would silently leave every other chapter's history in place.
//
// SAFE BY DEFAULT: without --apply this only prints what it would delete.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";
import { RETENTION_PLAN } from "../lib/retention-plan.js";

const apply = process.argv.includes("--apply");
const daysArg = process.argv.indexOf("--days");
const globalDays = daysArg !== -1 ? Number(process.argv[daysArg + 1]) : null;
if (daysArg !== -1 && (!Number.isFinite(globalDays) || globalDays < 1)) {
  console.error("--days must be a positive number");
  process.exit(1);
}

// Windows live in lib/retention-plan.js so the cron job cannot drift from this
// script (it already had, once).
const PLAN = RETENTION_PLAN;

const sql = postgres(databaseUrl(), { max: 1, prepare: false });

let failed = false;

try {
  console.log(apply ? "PRUNE (applying)" : "PRUNE (dry run — pass --apply to delete)");
  console.log("");

  for (const item of PLAN) {
    const days = globalDays ?? item.days;
    if (globalDays != null) {
      console.log(`  NOTE  --days ${globalDays} overrides every default window.`);
    }

    // Skip silently if the table or column does not exist: this script must keep
    // working as the schema evolves, and a missing table is not a failure.
    const exists = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${item.table} AND column_name = ${item.column}`;
    if (!exists.length) {
      console.log(`  SKIP  ${item.table} (no ${item.column} column)`);
      continue;
    }

    // The window is a parameter, not a template fragment: interpolating an
    // identifier into an INTERVAL literal is not valid Postgres syntax, and
    // make_interval keeps the unit explicit so "90" always means 90 days.
    // item.readOnly restricts the delete to rows the user has already seen, so
    // pruning can never remove an unread alert.
    const cutoff = sql`make_interval(days => ${days})`;
    const where = item.readOnly
      ? sql`SELECT count(*)::int AS n FROM ${sql(item.table)}
           WHERE ${sql(item.column)} < NOW() - ${cutoff} AND read_at IS NOT NULL`
      : sql`SELECT count(*)::int AS n FROM ${sql(item.table)}
           WHERE ${sql(item.column)} < NOW() - ${cutoff}`;

    const [{ n }] = await where;
    console.log(`  ${n > 0 ? "WOULD DELETE" : "clean     "}  ${item.table.padEnd(16)} ${String(n).padStart(6)} rows older than ${days}d  (${item.note})`);

    if (n === 0) continue;

    if (!apply) continue;

    let deleted;
    if (item.readOnly) {
      deleted = await sql`
        DELETE FROM ${sql(item.table)}
        WHERE ${sql(item.column)} < NOW() - ${cutoff} AND read_at IS NOT NULL
        RETURNING id`;
    } else {
      deleted = await sql`
        DELETE FROM ${sql(item.table)}
        WHERE ${sql(item.column)} < NOW() - ${cutoff}
        RETURNING id`;
    }
    console.log(`           -> deleted ${deleted.length} rows`);
  }
} catch (e) {
  console.error("prune failed:", e.message);
  failed = true;
} finally {
  await sql.end();
}

console.log("");
if (!apply) console.log("Dry run. Re-run with --apply to perform these deletions.");
process.exit(failed ? 1 : 0);