import postgres from "postgres";
import { env } from "@/lib/env";

let client;

function getClient() {
  if (!client) {
    if (!env.DATABASE_URL) {
      throw new Error("[db] DATABASE_URL is not set â€” add it to .env.local (see .env.example)");
    }
    // PgBouncer pooler endpoint (:6543) multiplexes server-side, so a wider
    // client pool lets batched page queries actually run concurrently.
    // prepare:false is mandatory here: the pooler runs in transaction mode,
    // where named prepared statements vanish between checkouts â€” parallel
    // queries otherwise die with `prepared statement "..." does not exist`.
    client = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 10, prepare: false });
  }
  return client;
}

export function getSql() {
  return getClient();
}

// RLS tenant isolation: run callback inside a txn with SET LOCAL app.tenant_id
// Must use postgres.js `sql.begin` so pooler transaction mode keeps the setting alive.
// If tenantId is null/empty, runs without isolation (bootstrap/migration).
export async function withTenant(tenantId, callback) {
  const sql = getClient();
  if (!tenantId) return callback(sql);
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${String(tenantId)}, true)`;
    return callback(tx);
  });
}

// Tenant config is near-static and fetched on EVERY page load (3 queries).
// Memoize per slug for 60s so N page views in a minute cost ~0 round-trips.
// Tenant rows are global (not user-scoped), so sharing across requests is safe.
const tenantCache = new Map();

export async function queryTenant(slug) {
  const hit = tenantCache.get(slug);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;

  const sql = getSql();
  const [tenant] = await sql`
    SELECT * FROM tenants WHERE slug = ${slug} LIMIT 1
  `;
  if (!tenant) return null;

  const [domains, flags] = await Promise.all([
    sql`SELECT * FROM tenant_domains WHERE tenant_id = ${tenant.id}`,
    sql`SELECT * FROM feature_flags WHERE tenant_id = ${tenant.id}`
  ]);

  const data = {
    ...tenant,
    domains,
    features: Object.fromEntries(flags.map(f => [f.key, f.enabled]))
  };
  tenantCache.set(slug, { at: Date.now(), data });
  return data;
}

// Host-based tenant lookup: custom domain first (tenant_domains.domain), then
// the slug subdomain. This replaces a Supabase REST lookup that used the anon
// key â€” migration 026 correctly revoked every table grant from anon, so that
// path silently resolved to null and every host-resolved page/API degraded to an
// empty state. Resolving over the pooled connection keeps working regardless of
// what roles are granted, and skips a network round-trip to the REST API.
export async function queryTenantByHost(host) {
  const normalized = String(host || "").split(":")[0].toLowerCase();
  if (!normalized) return null;
  const sql = getSql();

  if (normalized === "127.0.0.1" || normalized === "localhost") {
    return queryTenant(env.DEV_TENANT_SLUG || "demo-college");
  }

  const slugGuess = normalized.split(".")[0];
  const [byDomain] = await sql`
    SELECT t.slug FROM tenant_domains d
    JOIN tenants t ON t.id = d.tenant_id
    WHERE lower(d.domain) = ${normalized} LIMIT 1
  `;
  return queryTenant(byDomain?.slug || slugGuess);
}
