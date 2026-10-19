// Verifies flag state. `npm run flag:verify` (status) is the read-only default.
//
// This is NOT the RLS gate -- `npm run rls:verify` (load/verify-rls.js) is. Both
// are reported here because an operator running the rollout checks both.
//
// Reads .env.local through load/env-local.js like every other script here. It
// used to read process.env.DATABASE_URL directly, so it only worked when the
// variable happened to be exported in the shell -- the most likely reason an
// operator saw a connection error instead of the flag they came to inspect.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const sql = postgres(databaseUrl(), { max: 1, prepare: false });
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
  const flags = await sql`
    SELECT t.slug, f.key, f.enabled
    FROM feature_flags f JOIN tenants t ON t.id = f.tenant_id
    ORDER BY f.key, t.slug`;
  console.log("flags:", JSON.stringify(flags));
  const [test] = await sql`SELECT COUNT(*)::int AS c FROM github_events WHERE delivery_id LIKE 'test-%' OR delivery_id LIKE 'manual-%'`;
  console.log("stored test rows:", test.c);

  // Surfaced here so the operator sees the rollout switch in the same output as
  // everything else. Still read-only: changing it stays a deliberate SQL step.
  const rls = flags.filter((f) => f.key === "tenant_rls_enforced");
  console.log(
    rls.some((f) => f.enabled)
      ? `tenant_rls_enforced: ON for ${rls.filter((f) => f.enabled).map((f) => f.slug).join(", ")}`
      : "tenant_rls_enforced: OFF"
  );
} finally {
  await sql.end();
}
