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

// Pre-flight the OWNER connection before opening either pool. Both mistakes
// below produced a raw Postgres error that pointed nowhere useful:
//
//   1. DATABASE_URL pointing at loom_app instead of postgres. Then this script
//      cannot CREATE the probe table and reports "permission denied for schema
//      public" -- which reads like a grants problem, not a misconfiguration.
//   2. DATABASE_APP_URL holding a password from an earlier create-app-role run,
//      which rotates on every invocation. Reported as a bare "password
//      authentication failed for user loom_app".
//
// Both are cheap to detect here and expensive to diagnose from the raw error.
function roleOf(url) {
  try {
    return new URL(url).username.split(".")[0];
  } catch {
    return "(unparseable)";
  }
}

if (roleOf(databaseUrl()) !== "postgres") {
  console.error(
    `DATABASE_URL must be the OWNER connection (postgresql://postgres.<project-ref>:...).\n` +
    `It currently authenticates as "${roleOf(databaseUrl())}".\n` +
    `  - If it is loom_app, request handling and migrations are sharing one role.\n` +
    `  - Owner credentials: Supabase dashboard -> Project Settings -> Database -> Connection string.\n` +
    `RLS verification needs an owner connection to create its probe table.`
  );
  process.exit(1);
}

if (roleOf(appUrl) !== "loom_app") {
  console.error(
    `DATABASE_APP_URL must authenticate as loom_app, got "${roleOf(appUrl)}".\n` +
    `  - Run: node load/create-app-role.js  (it rotates the password every time)\n` +
    `  - Then paste the printed URL into .env.local and Vercel.\n` +
    `Using the owner connection here would make this check meaningless.`
  );
  process.exit(1);
}

const owner = postgres(databaseUrl(), { max: 1, prepare: false });
const app = postgres(appUrl, { max: 1, prepare: false });

let failed = false;
const ok = (c, m) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failed = true; };

try {
  console.log("\n1. Role attributes");
  // Confirm the owner connection really is the owner. Cheap, and it stops a
  // half-migrated database from being reported as verified.
  const [me] = await owner`
    SELECT current_user AS u,
           (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS byp`;
  ok(me?.u === "postgres", `owner connection is postgres (got ${me?.u})`);
  ok(me?.byp === true, `owner has BYPASSRLS (got ${me?.byp}) — confirms why DATABASE_URL must not serve requests`);

  const [role] = await owner`SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'loom_app'`;
  if (!role) {
    console.log("  FAIL  loom_app does not exist. Run: node load/migrate.js");
    process.exit(1);
  }
  ok(role.rolsuper === false, `rolsuper = false (got ${role.rolsuper})`);
  ok(role.rolbypassrls === false, `rolbypassrls = false (got ${role.rolbypassrls})`);
  ok(role.rolcanlogin === true, `rolcanlogin = true (got ${role.rolcanlogin})`);

  // Turn an auth failure into the instruction that actually fixes it. The raw
  // "password authentication failed for user loom_app" is the single most
  // confusing message this script can emit, because the cause is almost always
  // a rotated password that never made it into .env.local.
  let [live] = [{ u: undefined }];
  try {
    [live] = await app`SELECT current_user AS u`;
  } catch (e) {
    if (/password authentication failed/i.test(e.message)) {
      console.error(
        "\nDATABASE_APP_URL is rejected by Postgres.\n" +
        "  The most likely cause: node load/create-app-role.js was run again and\n" +
        "  ROTATED the loom_app password, so the URL in .env.local is now stale.\n" +
        "\n  Fix: re-run `npm run rls:role`, then replace the DATABASE_APP_URL line\n" +
        "  in .env.local (and Vercel) with the URL it prints.\n" +
        "  Note it prints ONCE and must not be shared."
      );
      process.exit(1);
    }
    throw e;
  }
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

  console.log("\n3. Fail-closed tenant isolation (live probe)");
  // Prove the property that matters: a tenant cannot read another tenant's rows,
  // and an unset app.tenant_id denies rather than allows.
  const probeTenant = await owner`
    INSERT INTO tenants (slug, name) VALUES ('rls-verify-probe', 'RLS Verify Probe')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
  const probeId = probeTenant[0].id;
  const realTenant = (await owner`SELECT id FROM tenants WHERE slug = 'demo-college' LIMIT 1`)[0]?.id;
  try {
    if (!realTenant) {
      // Hard fail, not a skip. This block is the only proof that an unset claim
      // DENIES and that one tenant cannot read another's rows. Skipping it and
      // printing RESULT: PASS is the most dangerous outcome this script can
      // produce: an operator would read it as clearance to flip the flag.
      console.log("  FAIL  no demo-college tenant to compare against, so isolation was NOT verified");
      failed = true;
    } else {
      await owner`
        INSERT INTO profiles (user_id, name, role, tenant_id)
        VALUES ('rls-verify-user', 'Probe Student', 'student', ${probeId})
        ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id`;

      const unset = await app`SELECT count(*)::int AS n FROM profiles`;
      ok(unset[0].n === 0, `unset app.tenant_id denies (read ${unset[0].n} rows, expected 0)`);

      const crossTenant = await app.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${realTenant}, true)`;
        return tx`SELECT count(*)::int AS n FROM profiles WHERE user_id = 'rls-verify-user'`;
      });
      ok(crossTenant[0].n === 0, `tenant A cannot read tenant B's row (read ${crossTenant[0].n}, expected 0)`);

      const ownerSees = await owner`SELECT count(*)::int AS n FROM profiles WHERE user_id = 'rls-verify-user'`;
      ok(ownerSees[0].n === 1, `owner connection still sees it (${ownerSees[0].n} row) — confirms the row exists`);

      const ownScope = await app.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${realTenant}, true)`;
        return tx`SELECT count(*)::int AS n FROM profiles`;
      });
      ok(ownScope[0].n > 0, `tenant A reads its own profiles (${ownScope[0].n} rows)`);
    }
  } finally {
    await owner`DELETE FROM profiles WHERE user_id = 'rls-verify-user'`;
    await owner`DELETE FROM tenants WHERE id = ${probeId}`;
  }

  console.log("\n4. Safety rail");
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

  console.log("\n5. Coverage");
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
