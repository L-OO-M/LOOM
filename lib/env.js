export const env = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  // Connection used for request handling. Runs as `loom_app`, which is
  // NOSUPERUSER / NOBYPASSRLS / not the table owner — the only reason Row Level
  // Security can ever be enforced. `postgres` (DATABASE_URL) has
  // rolbypassrls = true, which overrides FORCE ROW LEVEL SECURITY entirely, so
  // anything running on the owner connection is invisible to RLS.
  //
  // DATABASE_URL stays in use for migrations, seeds, schema export and the
  // system jobs that must run unscoped. Falls back to DATABASE_URL until this
  // is set, so nothing breaks by omission.
  //
  // DATABASE_APP_URL_EXPLICIT records whether the value came from the
  // environment or from that fallback. The fallback is what makes a half-finished
  // rollout SILENT: `postgres` has rolbypassrls = true, so scoping it looks
  // like it works while every policy is decorative. The RLS switch therefore
  // refuses to engage unless this is true (see lib/auth-server.js).
  DATABASE_APP_URL: process.env.DATABASE_APP_URL || process.env.DATABASE_URL,
  DATABASE_APP_URL_EXPLICIT: Boolean(process.env.DATABASE_APP_URL),
  DEV_TENANT_SLUG: process.env.DEV_TENANT_SLUG || "demo-college",
  DEV_TENANT_DOMAIN: process.env.DEV_TENANT_DOMAIN || "localhost",
  // Which chapter a server-to-server delivery belongs to when the Host header
  // carries no chapter identity. GitHub posts to the shared deployment origin
  // (e.g. <app>.vercel.app), which is in no tenant_domains row, so host
  // resolution returned null and every webhook 404'd with TENANT_NOT_FOUND.
  // Ingestion is pinned to one chapter by configuration rather than by header.
  DEFAULT_TENANT_SLUG: process.env.DEFAULT_TENANT_SLUG || process.env.DEV_TENANT_SLUG || "demo-college",
  CREDENTIAL_SECRET: process.env.CREDENTIAL_SECRET,
  // GitHub OAuth App (https://github.com/settings/developers).
  //
  // This is the REPOSITORY grant, not sign-in. Supabase's GitHub provider
  // handles identity separately and requests only `read:user user:email`, so it
  // cannot prove repository ownership. These two are deliberately separate
  // credentials for that reason: they have different blast radii and different
  // consent screens.
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  // 32-byte base64 key for AES-256-GCM sealing of stored access tokens
  // (lib/crypto.js). Rotating it orphans every stored token, which is why
  // sealed values carry a version prefix rather than being raw ciphertext.
  GITHUB_TOKEN_ENCRYPTION_KEY: process.env.GITHUB_TOKEN_ENCRYPTION_KEY,
  GITHUB_WEBHOOK_SECRET:
    process.env.GITHUB_WEBHOOK_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : "dev-secret"),
  QSTASH_TOKEN: process.env.QSTASH_TOKEN,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  // Supabase Storage bucket for lead-tool documents/assets (lib/storage.js).
  // Defaults so local dev works without an extra env var; override per deploy.
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET || "loom-files",
  SENTRY_DSN: process.env.SENTRY_DSN
};

/**
 * Values that are fine locally and catastrophic in production. Rejected by
 * VALUE, not by presence: setting the variable at all used to look like a
 * successful configuration, because the fallback guard in env above only covers
 * the unset case. A deploy carrying `GITHUB_WEBHOOK_SECRET=dev-secret` -- which
 * is literally the value shipped in .env.example -- passed the old check while
 * accepting a publicly known HMAC key.
 */
const PLACEHOLDER_SECRETS = new Set([
  "dev-secret",
  "hello",
  "secret",
  "changeme",
  "change-me",
  "password",
  "postgres",
  "your-secret",
  "your_password",
  "please-change",
  "test"
]);

// Below this, an HMAC/signing key is brute-forceable. Not a format rule for
// every secret (R2 account ids are short), only for the signing ones.
const MIN_SIGNING_SECRET_LENGTH = 16;

function isPlaceholder(value) {
  if (!value) return false;
  return PLACEHOLDER_SECRETS.has(String(value).trim().toLowerCase());
}

/**
 * Fail-fast boot check for server-only paths (webhook, credential signing,
 * health probe). Call at the start of the handler — never at module scope,
 * because this module is also imported by client components.
 *
 * Throws in production when a secret is missing OR is a documented placeholder.
 */
export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== "production") return;

  const problems = [];
  const missing = [];
  const weak = [];

  // --- required on every server path ---
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");

  // --- signing secrets: required, and must not be a known default ---
  const signing = {
    GITHUB_WEBHOOK_SECRET: env.GITHUB_WEBHOOK_SECRET,
    // Signs credential share links. Falls back to the webhook secret, which is
    // why it is only separately required when the fallback is also weak.
    CREDENTIAL_SECRET: env.CREDENTIAL_SECRET || env.GITHUB_WEBHOOK_SECRET
  };
  for (const [name, value] of Object.entries(signing)) {
    if (!value) missing.push(name);
    else if (isPlaceholder(value)) weak.push(`${name} (known placeholder)`);
    else if (String(value).length < MIN_SIGNING_SECRET_LENGTH) {
      weak.push(`${name} (shorter than ${MIN_SIGNING_SECRET_LENGTH} characters)`);
    }
  }

  // --- GitHub OAuth: a missing client secret means ownership is asserted, not
  // proven, and the UI must say so rather than silently degrade. The encryption
  // key is required separately from the secret because it guards tokens we have
  // ALREADY stored: a client secret is rotatable by re-running OAuth, but a lost
  // encryption key is unrecoverable for every member who has linked. ---
  if (!env.GITHUB_CLIENT_ID) missing.push("GITHUB_CLIENT_ID");
  if (!env.GITHUB_CLIENT_SECRET) missing.push("GITHUB_CLIENT_SECRET");
  if (env.GITHUB_CLIENT_SECRET && isPlaceholder(env.GITHUB_CLIENT_SECRET)) {
    weak.push("GITHUB_CLIENT_SECRET (known placeholder)");
  }
  if (!env.GITHUB_TOKEN_ENCRYPTION_KEY) missing.push("GITHUB_TOKEN_ENCRYPTION_KEY");
  else if (isPlaceholder(env.GITHUB_TOKEN_ENCRYPTION_KEY)) {
    weak.push("GITHUB_TOKEN_ENCRYPTION_KEY (known placeholder)");
  } else {
    // Length is checked in bytes, not characters: a 32-char base64 string is 24
    // bytes, which AES-256 would reject anyway. Failing here produces a message
    // at boot instead of a runtime throw deep inside a callback.
    let keyLen = 0;
    try {
      keyLen = Buffer.from(env.GITHUB_TOKEN_ENCRYPTION_KEY, "base64").length;
    } catch {
      keyLen = 0;
    }
    if (keyLen !== 32) {
      weak.push(`GITHUB_TOKEN_ENCRYPTION_KEY (must be 32 bytes base64; got ${keyLen} — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")`);
    }
  }

  // --- RLS-critical: the flag is ON but this falls back to the BYPASSRLS owner
  // connection, which makes enforcement a silent no-op (lib/auth-server.js). ---
  if (!env.DATABASE_APP_URL_EXPLICIT) {
    missing.push("DATABASE_APP_URL (request handling would fall back to the owner connection)");
  }

  // --- canonical/OG correctness: a localhost default here silently publishes
  // every absolute URL on the public site as http://localhost:3000. ---
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    missing.push("NEXT_PUBLIC_APP_URL (absolute canonicals and OG tags would point at localhost)");
  }

  if (missing.length > 0 || weak.length > 0) {
    const detail = [
      missing.length ? `missing: ${missing.join(", ")}` : null,
      weak.length ? `insecure: ${weak.join(", ")}` : null
    ]
      .filter(Boolean)
      .join(" | ");
    throw new Error(`[env] refusing to serve in production — ${detail}`);
  }
}

/**
 * The subset an uptime monitor can call without a session. Kept separate so the
 * public health route can report configuration health without throwing on
 * optional (unused-yet) integrations.
 */
export function secretProblems() {
  if (process.env.NODE_ENV !== "production") return [];
  const problems = [];
  if (isPlaceholder(env.GITHUB_WEBHOOK_SECRET)) problems.push("GITHUB_WEBHOOK_SECRET is a placeholder");
  if (!env.GITHUB_CLIENT_ID) problems.push("GITHUB_CLIENT_ID is not set");
  if (!env.GITHUB_CLIENT_SECRET) problems.push("GITHUB_CLIENT_SECRET is not set");
  if (!env.GITHUB_TOKEN_ENCRYPTION_KEY) problems.push("GITHUB_TOKEN_ENCRYPTION_KEY is not set");
  if (!env.DATABASE_APP_URL_EXPLICIT) problems.push("DATABASE_APP_URL is not set");
  if (!env.NEXT_PUBLIC_APP_URL) problems.push("NEXT_PUBLIC_APP_URL is not set");
  return problems;
}