// Tracked migration runner. Applies SQL files in load/migrations/ in order.
// Usage: node load/migrate.js            (uses DATABASE_URL)
//        node load/migrate.js --target   (uses DATABASE_URL_TARGET / DATABASE_URL_MUMBAI)
// Requires the target URL in process.env (same pooler string as .env.local).
//
// RELEASE SAFETY (added for the roadmap_node_resources rollout):
// - Each file runs inside ONE transaction. Postgres DDL is transactional, so a
//   file either lands completely or not at all. The previous runner executed
//   statements one at a time: a failure halfway through left a half-applied
//   migration on disk with no schema_migrations row, which is exactly the state
//   that makes a later re-run ambiguous.
// - The file is only recorded in schema_migrations after its transaction
//   commits, so "recorded" always means "applied".
// - A session advisory lock serialises concurrent runs (a Vercel deploy and a
//   maintainer running migrations at the same time). The second process waits
//   instead of racing. The lock is released when the connection closes.
// - Already-applied files are skipped by name, so databases that already have
//   036 recorded are unaffected by this change.
// - Every file stays idempotent (IF NOT EXISTS), so re-running is always safe.
//
// This script WRITES to whatever DATABASE_URL points at and refuses to guess:
// it never reads a URL from the app, and the caller must set the env var
// explicitly. It is never invoked by the build (see docs/15).
const fs = require("fs");
const path = require("path");

// Arbitrary but stable key for the advisory lock.
const MIGRATION_LOCK_KEY = "loom_schema_migrations";

async function main() {
  const { default: postgres } = await import("postgres");
  const useTarget = process.argv.includes("--target");
  const url = useTarget
    ? (process.env.DATABASE_URL_TARGET || process.env.DATABASE_URL_MUMBAI)
    : process.env.DATABASE_URL;
  if (!url) {
    console.error(useTarget
      ? "DATABASE_URL_TARGET / DATABASE_URL_MUMBAI is not set. Refusing to run migrations."
      : "DATABASE_URL is not set. Refusing to run migrations.");
    process.exit(1);
  }
  // Never print the URL: it carries the password.
  const target = useTarget ? "MUMBAI (ap-south-1)" : "DATABASE_URL";
  console.log(`target: ${target} (connection string not printed)`);
  const sql = postgres(url, { max: 1, connect_timeout: 20 });
  let applied = 0;
  let skipped = 0;
  try {
    // Serialise runners. Same lock name for every environment.
    await sql`SELECT pg_advisory_lock(hashtext(${MIGRATION_LOCK_KEY}))`;
    await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;

    const dir = path.join(__dirname, "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const [row] = await sql`SELECT name FROM public.schema_migrations WHERE name = ${file} LIMIT 1`;
      if (row) {
        console.log(`skip  ${file} (already applied)`);
        skipped += 1;
        continue;
      }
      const statement = fs.readFileSync(path.join(dir, file), "utf8");
      console.log(`apply ${file} ...`);
      // One transaction per file: DDL + its tracking row commit together.
      // A failure rolls the whole file back and leaves no tracking row, so a
      // re-run starts from a known state instead of a half-applied one.
      await sql.begin(async (tx) => {
        await tx.unsafe(statement);
        await tx`INSERT INTO public.schema_migrations (name) VALUES (${file})`;
      });
      console.log(`done  ${file}`);
      applied += 1;
    }
    console.log(`migrate: ${applied} applied, ${skipped} already present, ${files.length} tracked total`);
    if (applied === 0) {
      console.log("migrate: schema already up to date — safe to deploy code that depends on it.");
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("migrate failed — the failing file was rolled back and NOT recorded:");
  console.error(e);
  process.exit(1);
});