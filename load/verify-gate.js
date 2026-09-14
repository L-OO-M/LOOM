// Verifies the github_integration kill-switch state.
// Usage: node load/verify-gate.js [enable|disable|status|clean]  (needs DATABASE_URL)
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const mode = process.argv[2] || "status";
try {
  if (mode === "enable" || mode === "disable") {
    const on = mode === "enable";
    const rows = await sql`
      UPDATE feature_flags SET enabled = ${on}, updated_at = NOW()
      WHERE key = 'github_integration' RETURNING tenant_id, enabled`;
    console.log(`github_integration → ${on} for ${rows.length} tenant(s)`);
  }
  if (mode === "clean") {
    const gone = await sql`DELETE FROM github_events WHERE delivery_id LIKE 'test-%' OR delivery_id LIKE 'manual-%' RETURNING id`;
    console.log("deleted test rows:", gone.length);
  }
  const flags = await sql`SELECT t.slug, f.enabled FROM feature_flags f JOIN tenants t ON t.id = f.tenant_id WHERE f.key = 'github_integration'`;
  console.log("flags:", JSON.stringify(flags));
  const [test] = await sql`SELECT COUNT(*)::int AS c FROM github_events WHERE delivery_id LIKE 'test-%' OR delivery_id LIKE 'manual-%'`;
  console.log("stored test rows:", test.c);
} finally {
  await sql.end();
}
