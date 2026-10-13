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
  DATABASE_APP_URL: process.env.DATABASE_APP_URL || process.env.DATABASE_URL,
  DEV_TENANT_SLUG: process.env.DEV_TENANT_SLUG || "demo-college",
  DEV_TENANT_DOMAIN: process.env.DEV_TENANT_DOMAIN || "localhost",
  // Which chapter a server-to-server delivery belongs to when the Host header
  // carries no chapter identity. GitHub posts to the shared deployment origin
  // (e.g. <app>.vercel.app), which is in no tenant_domains row, so host
  // resolution returned null and every webhook 404'd with TENANT_NOT_FOUND.
  // Ingestion is pinned to one chapter by configuration rather than by header.
  DEFAULT_TENANT_SLUG: process.env.DEFAULT_TENANT_SLUG || process.env.DEV_TENANT_SLUG || "demo-college",
  // "dev-secret" exists for local development only. In production the value
  // is undefined so HMAC verification fails closed instead of accepting a
  // publicly known default (see assertProductionSecrets).
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
  SENTRY_DSN: process.env.SENTRY_DSN
};

/**
 * Fail-fast boot check for server-only ingestion paths (webhook, job queue).
 * Call at the start of the handler — never at module scope, because this
 * module is also imported by client components. Throws in production when a
 * secret is missing or still a documented dev default.
 */
export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!env.GITHUB_WEBHOOK_SECRET) missing.push("GITHUB_WEBHOOK_SECRET");
  const credentialSecret = process.env.CREDENTIAL_SECRET || env.GITHUB_WEBHOOK_SECRET;
  if (!credentialSecret) missing.push("CREDENTIAL_SECRET (or GITHUB_WEBHOOK_SECRET)");
  if (missing.length > 0) {
    throw new Error(`[env] refusing to serve ingestion with insecure secrets in production: ${missing.join(", ")}`);
  }
}