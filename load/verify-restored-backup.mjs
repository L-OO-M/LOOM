// Read-only verification for a database restored into an isolated scratch project.
// Never point this at production. The explicit variable prevents accidental use
// of DATABASE_URL, and every query below is SELECT-only.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.SCRATCH_RESTORE_DATABASE_URL;
if (!url) {
  console.error("SCRATCH_RESTORE_DATABASE_URL is required; refusing to inspect DATABASE_URL");
  process.exit(1);
}
if (url === process.env.DATABASE_URL) {
  console.error("Scratch restore URL matches DATABASE_URL; refusing to test production");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20 });
try {
  const migrationDir = path.join(process.cwd(), "load", "migrations");
  const expected = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
  const applied = await sql`SELECT name FROM schema_migrations ORDER BY name`;
  const appliedNames = new Set(applied.map((row) => row.name));
  const missing = expected.filter((name) => !appliedNames.has(name));
  if (missing.length) throw new Error(`restored database is missing migrations: ${missing.join(", ")}`);

  const criticalTables = [
    "profiles", "events", "event_status_history", "scoped_role_grants",
    "tenant_keyrings", "certificates", "approval_requests", "approval_decisions",
    "workflow_instances", "workflow_handoffs", "audit_logs", "outbox"
  ];
  const tables = await sql`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY(${criticalTables})
  `;
  const byName = new Map(tables.map((row) => [row.relname, row]));
  for (const table of criticalTables) {
    const row = byName.get(table);
    if (!row) throw new Error(`critical table missing after restore: ${table}`);
    if (!row.relrowsecurity || !row.relforcerowsecurity) {
      throw new Error(`RLS is not forced after restore: ${table}`);
    }
  }

  const [orphans] = await sql`
    SELECT COUNT(*)::int AS count
    FROM scoped_role_grants g
    LEFT JOIN profiles p ON p.user_id = g.user_id AND p.tenant_id = g.tenant_id
    WHERE p.user_id IS NULL
  `;
  if (orphans.count !== 0) throw new Error(`restore contains ${orphans.count} cross-tenant/orphan grants`);

  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM tenants) AS tenants,
      (SELECT COUNT(*)::int FROM profiles) AS profiles,
      (SELECT COUNT(*)::int FROM events) AS events,
      (SELECT COUNT(*)::int FROM audit_logs) AS audit_logs
  `;
  const minimumTenants = Number(process.env.RESTORE_EXPECTED_MIN_TENANTS || 1);
  if (counts.tenants < minimumTenants) {
    throw new Error(`restored tenant count ${counts.tenants} is below expected minimum ${minimumTenants}`);
  }
  console.log(JSON.stringify({ ok: true, migrations: expected.length, counts }, null, 2));
} finally {
  await sql.end();
}
