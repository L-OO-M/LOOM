// Tracked migration runner. Applies SQL files in load/migrations/ in order.
// Usage: node load/migrate.js
// Uses DATABASE_URL from process.env (same pooler string as .env.local).
const fs = require("fs");
const path = require("path");

async function main() {
  const { default: postgres } = await import("postgres");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Refusing to run migrations.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const dir = path.join(__dirname, "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const [row] = await sql`SELECT name FROM public.schema_migrations WHERE name = ${file} LIMIT 1`;
      if (row) {
        console.log(`skip ${file} (already applied)`);
        continue;
      }
      const statement = fs.readFileSync(path.join(dir, file), "utf8");
      console.log(`apply ${file} ...`);
      await sql.unsafe(statement);
      await sql`INSERT INTO public.schema_migrations (name) VALUES (${file})`;
      console.log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
