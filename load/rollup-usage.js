// Daily usage rollup: raw page views and tour events -> usage_daily / tour_daily.
//
// The admin and lead usage dashboards read the aggregates, never the raw tables:
// raw rows are pruned after 180 days and a dashboard that scanned them would get
// slower every week.
//
// Usage:
//   node load/rollup-usage.js              # yesterday (the normal nightly run)
//   node load/rollup-usage.js --days 30    # backfill the last 30 complete days
//   node load/rollup-usage.js --preview    # report volume, write nothing
//
// Safe to run twice: each day is deleted and recomputed inside one transaction.
// Needs DATABASE_URL (owner) in env or .env.local - it spans every chapter.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";
import { rollupUsage } from "../lib/usage-rollup.js";

const args = process.argv.slice(2);
const daysIndex = args.indexOf("--days");
const days = daysIndex !== -1 ? Number(args[daysIndex + 1]) : 1;
if (!Number.isFinite(days) || days < 1 || days > 180) {
  console.error("--days must be between 1 and 180");
  process.exit(1);
}
const apply = !args.includes("--preview") && !args.includes("--dry-run");

const sql = postgres(databaseUrl(), { max: 1, prepare: false });

try {
  const result = await rollupUsage(sql, { days, apply });
  console.log(apply ? "ROLLUP (applied)" : "ROLLUP (dry run)");
  console.log(`  days        ${result.days.join(", ")}`);
  console.log(`  raw views   ${result.pageViews}`);
  console.log(`  raw events  ${result.tours}`);
  if (apply) {
    console.log(`  route rows  ${result.routes}`);
  } else {
    console.log("  pass --days N without --preview to write");
  }
} catch (error) {
  console.error("usage rollup failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
