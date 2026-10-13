// Operator check for the RLS rollout. Read-only apart from a temporary probe
// table that is dropped in the same run.
//
// Verifies the three things that must hold before any policy change is trusted:
//   1. loom_app exists and is NOT superuser / NOT BYPASSRLS / not the owner
//   2. RLS is actually EVALUATED for loom_app (and demonstrably NOT for the
//      owner connection, which is why DATABASE_URL must stay out of request
//      handling)
//   3. the tenant_rls_enforced safety rail is readable and says what we think
//
// Usage: node load/verify-rls.js
// Requires: DATABASE_URL (owner) and DATABASE_APP_URL in env or .env.local.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const appUrl = process.env.DATABASE_APP_URL;
if (!appUrl) {
  console.error("DATABASE_APP_URL is not set. Run: node load/create-app-role.js");
  process.exit(1);
}

const owner = postgres(databaseUrl(), { max: 1, prepare: false });
const app = postgres(appUrl, { max: 1, prepare: false });

let failed = false;
const ok = (c, m) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failed = true; };

try {
  console.log("\n1. Role attributes");
  const [role] = await owner`SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'loom_app'`;
  if (!role) {
    console.log("  FAIL  loom_app does not exist. Run: node load/migrate.js");
    process.exit(1);
  }
  ok(role.rolsuper === false, `rolsuper = false (got ${role.rolsuper})`);
  ok(role.rolbypassrls === false, `rolbypassrls = false (got ${role.rolbypassrls})`);
  ok(role.rolcanlogin === true, `rolcanlogin = true (got ${role.rolcanlogin})`);

  const [live] = await app`SELECT current_user AS u`;
  ok(live?.u === "loom_app", `app connection is loom_app (got ${live?.u})`);

  console.log("\n2. RLS is enforced for the app role");
  await owner`DROP TABLE IF EXISTS public._rls_probe CASCADE`;
  await owner`CREATE TABLE public._rls_probe (id int, tenant_id uuid)`;
  await owner`INSERT INTO public._rls_probe VALUES (1, '00000000-0000-0000-0000-000000000000'::uuid)`;
  await owner`GRANT SELECT ON public._rls_probe TO loom_app`;
  await owner`ALTER TABLE public._rls_probe ENABLE ROW LEVEL SECURITY`;
  await owner`ALTER TABLE public._rls_probe FORCE ROW LEVEL SECURITY`;
  await owner`CREATE POLICY deny_all ON public._rls_probe FOR ALL USING (false)`;

  // Owner returns the row despite FORCE (BYPASSRLS outranks FORCE). The app role
  // must return nothing, because the deny policy is actually evaluated.
  const [ownRows] = await owner`SELECT count(*)::int AS n FROM public._rls_probe`;
  const [appRows] = await app`SELECT count(*)::int AS n FROM public._rls_probe`;
  ok(ownRows.n === 1, `owner connection bypasses RLS (read ${ownRows.n} row) — confirms why DATABASE_URL must not serve requests`);
  ok(appRows.n === 0, `app connection is subject to RLS (read ${appRows.n} rows, expected 0)`);

  await owner`DROP TABLE public._rls_probe CASCADE`;

  console.log("\n3. Safety rail");
  const rail = await owner`
    SELECT t.slug, f.enabled
    FROM feature_flags f JOIN tenants t ON t.id = f.tenant_id
    WHERE f.key = 'tenant_rls_enforced' ORDER BY t.slug`;
  if (!rail.length) {
    console.log("  FAIL  no tenant_rls_enforced row. Run: node load/migrate.js");
    failed = true;
  } else {
    for (const r of rail) console.log(`  INFO  ${r.slug}: tenant_rls_enforced = ${r.enabled}`);
    if (rail.some((r) => r.enabled)) {
      console.log("  WARN  enforcement is ON — policies are live for app traffic.");
    } else {
      console.log("  INFO  enforcement is OFF — request handling still uses the owner connection.");
    }
  }

  console.log("\n4. Coverage");
  const cov = await owner`
    SELECT
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema='public' AND column_name='tenant_id')                       AS tenant_scoped,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity)             AS rls_on`;
  console.log(`  INFO  ${cov[0].tenant_scoped} tables have tenant_id; ${cov[0].rls_on} have RLS enabled`);
  if (cov[0].rls_on < cov[0].tenant_scoped) {
    console.log("  INFO  remaining RLS scope work: " + (cov[0].tenant_scoped - cov[0].rls_on) + " tables");
  }

  console.log(failed ? "\nRESULT: FAIL\n" : "\nRESULT: PASS\n");
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error("verify-rls failed:", e.message);
  process.exit(1);
} finally {
  await owner.end();
  await app.end();
}
