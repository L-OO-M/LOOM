// Verifies migration 014 (org model) + department seeds.
// Usage: node load/verify-014.js  (needs DATABASE_URL in env)
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const t = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('departments','department_memberships') ORDER BY 1`;
  console.log("tables:", t.map((r) => r.table_name).join(","));
  const c = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('vertical','roll_number','branch') ORDER BY 1`;
  console.log("profile cols:", c.map((r) => r.column_name).join(","));
  const d = await sql`SELECT slug, vertical, is_active FROM departments ORDER BY slug`;
  console.log("depts:", d.length, JSON.stringify(d.map((r) => r.slug)));
  const m = await sql`SELECT name FROM schema_migrations WHERE name='014_org_model.sql'`;
  console.log("migration tracked:", m.length === 1);
} finally {
  await sql.end();
}
