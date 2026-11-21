// Seeds the society's departments for every tenant (idempotent).
// Usage: node load/seed-departments.js
//
// The list is not defined here: lib/department-catalog.js is the single source
// for the thirteen org units, so a slug added there cannot silently miss the
// database. Non-technical departments ship active too: the public directory
// (/domains, the homepage grid) and the admin list both filter on is_active, so
// shipping them inactive hid publicity/design/sponsorship from the website
// entirely. An admin can still archive any department by hand.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";
import { DEPARTMENT_CATALOG } from "../lib/department-catalog.js";

const DATABASE_URL = databaseUrl();

const DEPARTMENTS = DEPARTMENT_CATALOG.map((d) => ({
  name: d.name,
  slug: d.slug,
  vertical: d.vertical,
  description: d.description
}));

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const tenants = await sql`SELECT id, slug FROM tenants`;
  if (!tenants.length) {
    console.error("No tenants found. Run seed-control-plane first.");
    process.exit(1);
  }
  let count = 0;
  for (const t of tenants) {
    for (const d of DEPARTMENTS) {
      await sql`
        INSERT INTO departments (tenant_id, name, slug, vertical, description, is_active)
        VALUES (${t.id}, ${d.name}, ${d.slug}, ${d.vertical}, ${d.description}, ${d.active !== false})
        ON CONFLICT (tenant_id, slug) DO UPDATE SET
          name = EXCLUDED.name, vertical = EXCLUDED.vertical, description = EXCLUDED.description
      `;
      count++;
    }
  }
  console.log(`Seeded ${count} department rows across ${tenants.length} tenant(s)`);
} catch (e) {
  console.error("Seed failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}