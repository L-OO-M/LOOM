// Repairs the public-schema ACL + default privileges on a Supabase project whose
// public schema was recreated (DROP SCHEMA public CASCADE; CREATE SCHEMA public).
//
// That reset silently changes the schema owner from pg_database_owner to
// postgres and drops the platform's ALTER DEFAULT PRIVILEGES for anon /
// authenticated / service_role. GoTrue then fails every login with
//   500 {"code":"unexpected_failure","message":"Database error querying schema"}
// because it can no longer resolve objects it expects in public.
//
// Usage: node --import ./load/env-local.js load/fix-public-schema-acl.js [--target]
import postgres from "postgres";
import { databaseUrl, targetDatabaseUrl } from "./env-local.js";

const useTarget = process.argv.includes("--target");
const sql = postgres(useTarget ? targetDatabaseUrl() : databaseUrl(), {
  max: 1, connect_timeout: 20, idle_timeout: 5,
});

// Exactly what a native Supabase project has, expressed as GRANT/REVOKE
// (Postgres has no `ALTER SCHEMA ... ACL` syntax). Re-applying is idempotent.
// Target ACL: pg_database_owner=UC, PUBLIC=U, postgres/anon/authenticated/
// service_role=U.

// Only the owner role's default privileges are reproducible from this session
// (a non-superuser cannot ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin).
// These already exist on a healthy project, so failure here is not fatal.
const DEFAULT_ACLS = [
  ["postgres", "public", "r", "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role"],
  ["postgres", "public", "f", "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role"],
  ["postgres", "public", "S", "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role"],
];

try {
  const [before] = await sql.unsafe(
    "SELECT nspowner::regrole::text AS owner, nspacl::text AS acl FROM pg_namespace WHERE nspname='public'");
  console.log("before:", JSON.stringify(before));

  await sql.unsafe("ALTER SCHEMA public OWNER TO pg_database_owner");
  await sql.unsafe("REVOKE ALL ON SCHEMA public FROM anon, authenticated, service_role");
  await sql.unsafe("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await sql.unsafe("GRANT USAGE, CREATE ON SCHEMA public TO pg_database_owner");
  await sql.unsafe("GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role");
  await sql.unsafe("GRANT USAGE ON SCHEMA public TO PUBLIC");
  for (const [, , , grantSql] of DEFAULT_ACLS) {
    try {
      await sql.unsafe(grantSql);
    } catch (e) {
      console.warn("  (skipped default privileges)", grantSql.split(" GRANT ")[1], "-", e.message.slice(0, 60));
    }
  }
  await sql.unsafe("ALTER SCHEMA public OWNER TO pg_database_owner");

  const [after] = await sql.unsafe(
    "SELECT nspowner::regrole::text AS owner, nspacl::text AS acl FROM pg_namespace WHERE nspname='public'");
  const defaults = await sql.unsafe(
    `SELECT d.defaclrole::regrole::text AS role, n.nspname, d.defaclobjtype
     FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname='public' ORDER BY 1,3`);
  console.log("after :", JSON.stringify(after));
  console.log("default ACLs on public:", JSON.stringify(defaults));
  console.log(after.owner === "pg_database_owner" ? "OK - public schema owner restored" : "STILL WRONG");
} catch (e) {
  console.error("fix-public-schema-acl failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}