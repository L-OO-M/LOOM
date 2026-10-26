// Auth0 migration assistant for existing Supabase Auth users.
//
// The migration is additive: Supabase stays the fallback until you explicitly
// retire it. Password hashes are exported locally into .auth0-migration/ (which
// is gitignored) and uploaded to Auth0's bulk import API. No hash or secret is
// printed by this script.
//
// Usage:
//   node load/auth0-migrate.mjs plan
//   node load/auth0-migrate.mjs export [--include-existing] [--no-user-id]
//   node load/auth0-migrate.mjs import --confirm [--upsert]
//   node load/auth0-migrate.mjs verify
//
// Required env: DATABASE_URL, AUTH0_DOMAIN, AUTH0_MANAGEMENT_CLIENT_ID,
// AUTH0_MANAGEMENT_CLIENT_SECRET. Import also needs AUTH0_DB_CONNECTION_ID
// (or an M2M grant with read:connections so it can resolve the connection).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const OUT_DIR = path.join(process.cwd(), ".auth0-migration");
const MAX_CHUNK_BYTES = 480 * 1024;
const DEFAULT_SCOPES = "read:users create:users";
const BCRYPT_10 = /^\$2[ab]\$10\$[./A-Za-z0-9]{53}$/;

let tokenCache = { value: "", expiresAt: 0 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function auth0Domain() {
  const value = String(process.env.AUTH0_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!value) throw new Error("AUTH0_DOMAIN is not set.");
  return value;
}

function auth0Config() {
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH0_MANAGEMENT_CLIENT_ID / AUTH0_MANAGEMENT_CLIENT_SECRET are not set.");
  }
  return { clientId, clientSecret, domain: auth0Domain() };
}

async function getToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt - 60_000 > now) return tokenCache.value;

  const { clientId, clientSecret, domain } = auth0Config();
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
      grant_type: "client_credentials",
      scope: process.env.AUTH0_MIGRATION_SCOPES || DEFAULT_SCOPES
    }),
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Auth0 token request failed (${response.status}): ${body.error_description || body.error || "no access token"}`);
  }
  const expiresIn = Number(body.expires_in) || 300;
  tokenCache = { value: body.access_token, expiresAt: now + expiresIn * 1000 };
  return tokenCache.value;
}

async function auth0Json(apiPath, options = {}) {
  const token = await getToken();
  const isForm = options.body instanceof FormData;
  const url = `https://${auth0Domain()}/api/v2${apiPath}`;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(isForm ? {} : { "content-type": "application/json" }),
        ...(options.headers || {})
      },
      cache: "no-store"
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (response.ok) return body;

    const message = body?.message || body?.error_description || body?.error || text || "request failed";
    lastError = new Error(`Auth0 ${apiPath.split("?")[0]} failed (${response.status}): ${message}`);
    if (response.status !== 429 && response.status < 500 && response.status !== 403) throw lastError;
    if (response.status === 403) throw lastError;
    await sleep(1000 * (attempt + 1));
  }
  throw lastError;
}

async function fetchAuth0UsersByEmail() {
  const byEmail = new Map();
  let page = 0;
  while (page < 1000) {
    const body = await auth0Json(`/users?per_page=100&page=${page}&include_totals=true`);
    const users = Array.isArray(body?.users) ? body.users : [];
    for (const user of users) {
      const email = normalizeEmail(user?.email);
      if (!email) continue;
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(user);
    }
    const total = Number(body?.total);
    if (users.length < 100 || (Number.isFinite(total) && (page + 1) * 100 >= total)) break;
    page += 1;
  }
  return byEmail;
}

async function resolveConnectionId() {
  if (process.env.AUTH0_DB_CONNECTION_ID) return process.env.AUTH0_DB_CONNECTION_ID;
  const connectionName = process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication";
  try {
    const connections = await auth0Json(`/connections?name=${encodeURIComponent(connectionName)}`);
    const match = Array.isArray(connections) ? connections.find((item) => item?.name === connectionName) : null;
    if (match?.id) return match.id;
  } catch (error) {
    if (/\(403\)/.test(error.message)) {
      throw new Error(
        "Auth0 refused GET /connections (403). Set AUTH0_DB_CONNECTION_ID or grant the M2M app read:connections."
      );
    }
    throw error;
  }
  throw new Error(
    `Could not resolve the Auth0 database connection "${connectionName}". Set AUTH0_DB_CONNECTION_ID from the Auth0 dashboard.`
  );
}

async function loadSupabaseSnapshot() {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 5, prepare: false });
  try {
    const rows = await sql`
      SELECT
        id::text AS id,
        email,
        email_confirmed_at,
        encrypted_password,
        raw_user_meta_data
      FROM auth.users
      ORDER BY created_at NULLS FIRST, id
    `;
    const duplicateEmails = await sql`
      SELECT lower(email) AS email, count(*)::int AS count
      FROM auth.users
      WHERE email IS NOT NULL AND email <> ''
      GROUP BY 1
      HAVING count(*) > 1
    `;
    const [identityCount] = await sql`SELECT count(*)::int AS count FROM public.user_identities`;
    return { rows, duplicateEmails, identityCount: identityCount?.count ?? 0 };
  } finally {
    await sql.end();
  }
}

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isCompatibleBcryptHash(value) {
  return typeof value === "string" && BCRYPT_10.test(value);
}

export function displayNameForRow(row) {
  const meta = row?.raw_user_meta_data && typeof row.raw_user_meta_data === "object" ? row.raw_user_meta_data : {};
  const joined = [meta.given_name, meta.family_name].filter(Boolean).join(" ");
  const candidate = meta.name || meta.full_name || joined || "";
  return String(candidate).trim().slice(0, 100);
}

export function toAuth0ImportRecord(row, { includeUserId = true } = {}) {
  const email = normalizeEmail(row?.email);
  if (!email) return { record: null, meta: { reason: "missing_email" } };

  const compatiblePassword = isCompatibleBcryptHash(row?.encrypted_password);
  const record = {
    email,
    email_verified: Boolean(row?.email_confirmed_at)
  };
  if (includeUserId && row?.id) record.user_id = String(row.id);
  if (compatiblePassword) record.password_hash = row.encrypted_password;

  const name = displayNameForRow(row);
  if (name) record.name = name;
  if (row?.id) record.app_metadata = { supabase_user_id: String(row.id) };

  return {
    record,
    meta: {
      email,
      compatiblePassword,
      requiresPasswordReset: !compatiblePassword
    }
  };
}

export function chunkRecords(records, maxBytes = MAX_CHUNK_BYTES) {
  const chunks = [];
  let current = [];
  for (const record of records) {
    const next = [...current, record];
    if (current.length && Buffer.byteLength(JSON.stringify(next)) > maxBytes) {
      chunks.push(current);
      current = [record];
    } else {
      current = next;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function summaryForRows(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      if (normalizeEmail(row.email)) summary.withEmail += 1;
      else summary.missingEmail += 1;
      if (row.email_confirmed_at) summary.confirmed += 1;
      if (row.encrypted_password) summary.withPassword += 1;
      if (isCompatibleBcryptHash(row.encrypted_password)) summary.compatiblePassword += 1;
      else summary.incompatiblePassword += 1;
      return summary;
    },
    {
      total: 0,
      withEmail: 0,
      missingEmail: 0,
      confirmed: 0,
      withPassword: 0,
      compatiblePassword: 0,
      incompatiblePassword: 0
    }
  );
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function readManifest() {
  const file = path.join(OUT_DIR, "manifest.json");
  if (!fs.existsSync(file)) throw new Error(`No export found at ${file}. Run "export" first.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeManifest(manifest) {
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const job = await auth0Json(`/jobs/${encodeURIComponent(jobId)}`);
    if (job?.status === "completed" || job?.status === "failed") return job;
    await sleep(2000);
  }
  throw new Error(`Auth0 import job ${jobId} did not finish within 3 minutes.`);
}

async function plan() {
  const snapshot = await loadSupabaseSnapshot();
  if (snapshot.duplicateEmails.length) {
    throw new Error(`Refusing to migrate: ${snapshot.duplicateEmails.length} duplicate email group(s) in auth.users.`);
  }
  const summary = summaryForRows(snapshot.rows);
  const auth0Users = await fetchAuth0UsersByEmail();
  const alreadyInAuth0 = snapshot.rows.filter((row) => auth0Users.has(normalizeEmail(row.email))).length;
  const toImport = summary.withEmail - alreadyInAuth0;

  const pending = Math.max(0, toImport);
  printJson({
    source: "supabase-auth-users",
    supabase: summary,
    auth0: {
      usersWithEmail: auth0Users.size,
      alreadyInAuth0,
      toImport: pending,
      managementApi: "reachable"
    },
    connection: {
      name: process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication",
      idConfigured: Boolean(process.env.AUTH0_DB_CONNECTION_ID)
    },
    linkedCanonicalIdentities: snapshot.identityCount,
    note:
      pending === 0
        ? "All Supabase emails already exist in Auth0. Run verify, then test a migrated password login."
        : "Run export, then import --confirm after setting AUTH0_DB_CONNECTION_ID or granting read:connections."
  });
}

async function exportUsers(args) {
  const includeExisting = args.includes("--include-existing");
  const includeUserId = !args.includes("--no-user-id");
  const snapshot = await loadSupabaseSnapshot();
  if (snapshot.duplicateEmails.length) {
    throw new Error(`Refusing to export: ${snapshot.duplicateEmails.length} duplicate email group(s) in auth.users.`);
  }

  const summary = summaryForRows(snapshot.rows);
  if (summary.missingEmail) throw new Error(`Refusing to export: ${summary.missingEmail} user(s) have no email.`);

  const auth0Users = await fetchAuth0UsersByEmail();
  const selected = snapshot.rows.filter((row) => includeExisting || !auth0Users.has(normalizeEmail(row.email)));
  const built = selected.map((row) => toAuth0ImportRecord(row, { includeUserId }));
  const records = built.map((item) => item.record).filter(Boolean);
  const requiresPasswordReset = built.filter((item) => item.meta?.requiresPasswordReset).length;
  const chunks = chunkRecords(records);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (/^users-\d+\.json$/.test(name)) fs.unlinkSync(path.join(OUT_DIR, name));
  }

  const manifestChunks = [];
  chunks.forEach((chunk, index) => {
    const file = `users-${index + 1}.json`;
    const body = `${JSON.stringify(chunk, null, 2)}\n`;
    fs.writeFileSync(path.join(OUT_DIR, file), body, { mode: 0o600 });
    manifestChunks.push({
      file,
      count: chunk.length,
      bytes: Buffer.byteLength(body),
      status: "pending",
      jobId: null,
      summary: null
    });
  });

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "supabase-auth-users",
    connection: process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication",
    connectionId: process.env.AUTH0_DB_CONNECTION_ID || null,
    includeUserId,
    includeExisting,
    counts: {
      supabaseTotal: summary.total,
      selected: records.length,
      skippedExisting: summary.withEmail - selected.length,
      compatiblePassword: summary.compatiblePassword,
      requiresPasswordReset,
      chunks: chunks.length
    },
    chunks: manifestChunks
  };
  writeManifest(manifest);

  console.log(`Exported ${records.length} Auth0 user record(s) into ${chunks.length} chunk(s).`);
  console.log(`Directory: ${OUT_DIR}`);
  console.log(`Skipped existing Auth0 users: ${summary.withEmail - selected.length}`);
  console.log("Password hash compatibility summary written to the manifest.");
  console.log("The exported files contain password hashes. Do not commit or upload them anywhere except Auth0.");
}

async function importUsers(args) {
  if (!args.includes("--confirm")) {
    throw new Error('Refusing to import without --confirm. Run "import --confirm" when you are ready.');
  }
  const manifest = readManifest();
  const connectionId = process.env.AUTH0_DB_CONNECTION_ID || manifest.connectionId || await resolveConnectionId();
  manifest.connectionId = connectionId;
  writeManifest(manifest);
  const upsert = args.includes("--upsert");

  for (const chunk of manifest.chunks) {
    if (chunk.status === "completed") {
      console.log(`skip ${chunk.file} (already completed)`);
      continue;
    }
    const file = path.join(OUT_DIR, chunk.file);
    if (!fs.existsSync(file)) throw new Error(`Missing export chunk: ${file}`);
    const form = new FormData();
    form.append("users", new Blob([fs.readFileSync(file)], { type: "application/json" }), chunk.file);
    form.append("connection_id", connectionId);
    if (upsert) form.append("upsert", "true");

    console.log(`upload ${chunk.file} (${chunk.count} users)...`);
    const job = await auth0Json("/jobs/users-imports", { method: "POST", body: form });
    chunk.jobId = job?.id || null;
    chunk.status = "submitted";
    writeManifest(manifest);
    if (!chunk.jobId) throw new Error(`Auth0 did not return a job id for ${chunk.file}.`);

    const finished = await waitForJob(chunk.jobId);
    chunk.status = finished.status;
    chunk.summary = finished.summary || null;
    writeManifest(manifest);
    console.log(`${chunk.file}: ${finished.status} ${JSON.stringify(chunk.summary || {})}`);
    if (finished.status !== "completed") {
      throw new Error(`Import job for ${chunk.file} ended with status ${finished.status}.`);
    }
  }

  console.log("Import complete. Run \"verify\" next, then test Auth0 login for a migrated account.");
}

async function verify() {
  const snapshot = await loadSupabaseSnapshot();
  const summary = summaryForRows(snapshot.rows);
  const auth0Users = await fetchAuth0UsersByEmail();
  const missing = snapshot.rows.filter((row) => {
    const email = normalizeEmail(row.email);
    return email && !auth0Users.has(email);
  }).length;

  printJson({
    supabase: summary,
    auth0: {
      usersWithEmail: auth0Users.size,
      missingFromAuth0: missing
    },
    linkedCanonicalIdentities: snapshot.identityCount,
    ok: missing === 0
  });
  if (missing > 0) process.exitCode = 1;
}

async function main() {
  const [command = "plan", ...args] = process.argv.slice(2);
  if (command === "plan") return plan();
  if (command === "export") return exportUsers(args);
  if (command === "import") return importUsers(args);
  if (command === "verify") return verify();
  throw new Error(`Unknown command "${command}". Use plan, export, import, or verify.`);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(`auth0-migrate: ${error.message}`);
    process.exitCode = 1;
  });
}
