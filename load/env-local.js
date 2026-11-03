// Shared DATABASE_URL loader for ESM scripts in load/.
// Prefers process.env, falls back to .env.local in the repo root
// (scripts run as `node load/<name>.js` from the root).
// Secrets must NEVER be hardcoded in tracked files.
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env.local — env only */
  }
}

loadEnvLocal();

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (checked env + .env.local).");
    process.exit(1);
  }
  return url;
}

// Tenant slug for seed and operator scripts. There is deliberately no hardcoded
// chapter: a deployment names its own institution through SEED_TENANT_SLUG,
// DEFAULT_TENANT_SLUG, or DEV_TENANT_SLUG.
export function seedTenantSlug() {
  const slug = process.env.SEED_TENANT_SLUG || process.env.DEFAULT_TENANT_SLUG || process.env.DEV_TENANT_SLUG;
  if (!slug) {
    console.error(
      "No tenant slug configured. Set SEED_TENANT_SLUG, DEFAULT_TENANT_SLUG, " +
      "or DEV_TENANT_SLUG in the environment or .env.local."
    );
    process.exit(1);
  }
  return slug;
}

// Used by the region-migration tooling (load/db-transfer.js, load/migrate.js).
// --target selects an explicit target when one is configured; once the cut-over
// is done DATABASE_URL is itself the target, so falling back to it keeps
// `import --target` working instead of erroring out.
export function targetDatabaseUrl() {
  const url = process.env.DATABASE_URL_TARGET || process.env.DATABASE_URL_MUMBAI || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL_TARGET / DATABASE_URL_MUMBAI / DATABASE_URL is not set (checked env + .env.local).");
    process.exit(1);
  }
  return url;
}
