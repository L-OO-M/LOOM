// Sets a password on the loom_app role and prints the DATABASE_APP_URL to paste
// into .env.local (and Vercel). The password is generated here and printed once;
// it is never written to a tracked file.
//
// Usage:
//   node load/create-app-role.js            # generate + set + print
//   node load/create-app-role.js --print    # just re-print the URL (no reset)
//
// Requires: migration 030 applied, and DATABASE_URL in env or .env.local.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const ROLE = "loom_app";
const printOnly = process.argv.includes("--print");

// This script SETS a password on loom_app. It must run on the OWNER connection.
// When DATABASE_URL was itself misconfigured to the loom_app URL, the old code
// failed much later with a bare "permission denied for schema public" that read
// like a grants problem. Fail here, with the actual cause named.
function roleOf(url) {
  try {
    return new URL(url).username.split(".")[0];
  } catch {
    return "(unparseable)";
  }
}

const baseUrl = databaseUrl();
const baseRole = roleOf(baseUrl);
if (baseRole !== "postgres") {
  console.error(
    `DATABASE_URL must be the OWNER connection; it authenticates as "${baseRole}".\n` +
    `  loom_app cannot ALTER ROLE, so this script cannot do its job on it.\n` +
    `  Owner credentials: Supabase dashboard -> Project Settings -> Database -> Connection string.`
  );
  process.exit(1);
}

const sql = postgres(baseUrl, { max: 1, prepare: false });

try {
  const [role] = await sql`SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = ${ROLE}`;
  if (!role) {
    console.error(`Role ${ROLE} does not exist. Run: node load/migrate.js`);
    process.exit(1);
  }
  if (role.rolsuper || role.rolbypassrls) {
    console.error(`${ROLE} has rolsuper=${role.rolsuper} / rolbypassrls=${role.rolbypassrls}.`);
    console.error("It must have BOTH false or Row Level Security will never be enforced.");
    process.exit(1);
  }

  if (printOnly) {
    const url = process.env.DATABASE_APP_URL;
    if (!url) {
      console.error("DATABASE_APP_URL is not set. Re-run without --print to generate one.");
      process.exit(1);
    }
    console.log("DATABASE_APP_URL=" + redact(url));
    process.exit(0);
  }

  // 32 random bytes -> 64 hex chars, URL-safe and quote-free by construction.
  const password = crypto.randomBytes(32).toString("hex");

  // DDL cannot be parameterised. Both interpolated values are provably
  // quote-free: ROLE is the literal constant above, and the password is
  // asserted hex-only before it is used. The assertion is the safety argument,
  // so it must never be removed.
  if (!/^[0-9a-f]{64}$/.test(password)) {
    throw new Error("Refusing to build DDL: generated password is not hex.");
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(ROLE)) {
    throw new Error("Refusing to build DDL: role name is not a plain identifier.");
  }
  await sql.unsafe(`ALTER ROLE "${ROLE}" LOGIN PASSWORD '${password}'`);

  const base = baseUrl;
  const u = new URL(base);

  // Supabase's pooler requires the `user.<project-ref>` form. The owner URL's
  // username is already that (e.g. `postgres.weqduvtpaoihrmzxnrek`), so reuse its
  // suffix for the new role. Without this the pooler rejects the login with
  // "no tenant identifier provided (external_id or sni_hostname required)".
  const dot = u.username.indexOf(".");
  if (dot === -1) {
    console.error(`DATABASE_URL username "${u.username}" is not in user.<project-ref> form.`);
    console.error("Supabase pooler logins require the project ref suffix.");
    process.exit(1);
  }
  const projectRef = u.username.slice(dot + 1);
  const dbName = (u.pathname || "/postgres").replace(/^\//, "") || "postgres";

  const appUrl =
    `postgresql://${ROLE}.${projectRef}:${password}@${u.hostname}:${u.port}/${dbName}`;

  console.log("");
  console.log("  Set " + ROLE + " password. Copy this into .env.local and Vercel:");
  console.log("");
  console.log("  DATABASE_APP_URL=" + appUrl);
  console.log("");
  console.log("  Store it. It is printed once and is not written to any tracked file.");
  console.log("");

  // Running this script ROTATES the password, which silently invalidates any
  // DATABASE_APP_URL already saved. That stale value then fails much later with
  // "password authentication failed for user loom_app" and no hint as to why.
  // Name it at the moment it happens.
  const stale = existingEnvLocalAppUrl();
  if (stale && stale !== appUrl) {
    console.log("  !! .env.local already holds a DIFFERENT DATABASE_APP_URL.");
    console.log("     That value is now STALE and will fail authentication.");
    console.log("     Replace that line in .env.local with the one printed above.");
    console.log("     Do the same for DATABASE_APP_URL in Vercel, or the deploy");
    console.log("     will keep using a credential that no longer exists.");
    console.log("");
  }
} catch (e) {
  console.error("Failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}

/** Current DATABASE_APP_URL in .env.local, or null. Never logs the value. */
function existingEnvLocalAppUrl() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    const m = raw.match(/^\s*DATABASE_APP_URL\s*=\s*(.*)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function redact(url) {
  try {
    const u = new URL(url);
    return `postgresql://${u.username}:***@${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_APP_URL)";
  }
}
