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

/**
 * Wrap a postgres client so every statement runs inside its own transaction
 * with the given GUCs applied via SET LOCAL.
 *
 * Why not just open one transaction for the request? Because getRequestContext()
 * resolves the tenant FROM the first query, and returns a client the caller uses
 * for the rest of the request. A `sql.begin` block would have to stay open for
 * the entire request, which does not survive the pooler (transaction mode) and
 * would pin a connection per in-flight request.
 *
 * Cost: one extra BEGIN/COMMIT round-trip per statement. Correctness first --
 * this is what makes RLS actually apply. If it shows up in latency, the fix is
 * a request-scoped transaction in the route handlers, not removing the scoping.
 *
 * @param {Function} client  postgres.js client (already the app role)
 * @param {Record<string,string|null>} settings  GUC name -> value; null entries skipped
 */
export function scopedSql(client, settings) {
  const pairs = Object.entries(settings).filter(([, v]) => v !== null && v !== undefined);
  if (!pairs.length) return client;
  return new Proxy(client, {
    apply(target, thisArg, args) {
      return client.begin(async (tx) => {
        for (const [key, value] of pairs) {
          await tx`SELECT set_config(${key}, ${String(value)}, true)`;
        }
        return tx(...args);
      });
    }
  });
}

export function getSql() {
  return getClient();
}

/** Application connection (loom_app). Exported so the RLS rollout can scope it. */
export function getAppSql() {
  return getAppClient();
}

let appClient;

// Application connection (loom_app: NOSUPERUSER, NOBYPASSRLS, not the table
// owner). This is the ONLY connection for which Row Level Security is
// meaningful — the owner connection above has rolbypassrls = true, which
// overrides FORCE ROW LEVEL SECURITY entirely, so policies are never even
// evaluated for it. Falls back to the owner until DATABASE_APP_URL is set, so
// RLS stays a harmless no-op rather than breaking the app.
function getAppClient() {
  if (!appClient) {
    const url = env.DATABASE_APP_URL || env.DATABASE_URL;
    if (!url) {
      throw new Error("[db] DATABASE_APP_URL is not set — add it to .env.local (see .env.example)");
    }
    appClient = postgres(url, { max: 10, idle_timeout: 10, prepare: false });
  }
  return appClient;
}

// RLS tenant isolation: run callback inside a txn with SET LOCAL app.tenant_id
// Must use postgres.js `sql.begin` so pooler transaction mode keeps the setting alive.
// If tenantId is null/empty, runs without isolation (bootstrap/migration).
//
// NOTE: currently has NO call sites. Request handling still uses getSql(),
// which is the BYPASSRLS owner connection, so policies are not evaluated.
// Switching getRequestContext() to this is the next step of the RLS rollout.
export async function withTenant(tenantId, callback) {
  const sql = getAppClient();
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
