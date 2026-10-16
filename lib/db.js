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
 * TENANT SCOPING — the rule, in one place.
 *
 * Strict (tenant-owned) tables MUST be filtered with plain equality:
 *
 *     WHERE tenant_id = ${tid}::uuid
 *
 * Do NOT reintroduce `OR ${tid}::uuid IS NULL` or `OR tenant_id IS NULL` on a
 * strict table. Both were removed across the app because:
 *
 *   - The parameter-NULL form widened to "every tenant" whenever the caller's
 *     tenant failed to resolve. `getRequestContext` now fails closed with
 *     TENANT_UNRESOLVED instead of returning a null tenant, so the
 *     precondition holds centrally.
 *   - The column-NULL form would expose any row that happened to have a NULL
 *     tenant. No strict table holds such a row today (verified: 0 rows across
 *     code_snippets, skill_badges, student_achievements, student_oss_
 *     contributions, projects, mentors, forum_threads, wiki_pages, contests,
 *     events, faqs, volunteer_slots, feature_requests), so the branch was pure
 *     latent risk.
 *
 * The ONE legitimate exception is `open_source_projects`: it is a curated
 * GLOBAL catalogue whose rows are intentionally tenant-less, and its RLS policy
 * (migration 031) is literally `tenant_id IS NULL OR tenant_id = ...`. Its 6
 * rows all have a NULL tenant_id, so removing the arm would hide real data.
 *
 * `tests/tenant-isolation.test.js` enforces both halves of this rule.
 */

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

  // Apply every GUC in ONE round-trip instead of one per setting.
  //
  // Round trips per statement are the dominant cost here, not query execution:
  // measured against the Supabase pooler this wrapper originally cost ~316ms per
  // statement on top of the query, because BEGIN + 2x set_config + COMMIT is
  // four extra round-trips at ~79ms each. Folding the settings into a single
  // SELECT removes one of them. The remaining BEGIN/COMMIT overhead is
  // addressed by batching a whole request into one transaction -- see
  // getRequestContext.
  const applySettings = async (tx) => {
    if (!pairs.length) return;
    const selects = pairs
      .map((_, i) => `set_config($${i * 2 + 1}, $${i * 2 + 2}, true)`)
      .join(", ");
    const params = pairs.flatMap(([key, value]) => [key, String(value)]);
    // unsafe() takes the parameters as a single array -- spreading them as
    // separate arguments silently corrupts the bind list.
    await tx.unsafe(`SELECT ${selects}`, params);
  };

  return new Proxy(client, {
    apply(target, thisArg, args) {
      return client.begin(async (tx) => {
        await applySettings(tx);
        return tx(...args);
      });
    },
    get(target, prop) {
      // Forwarded explicitly, because a caller's transaction must inherit the
      // tenant scope: admin role promotion runs several statements in one
      // transaction and every one of them is subject to the same policy.
      if (prop === "begin") {
        return (fn) =>
          client.begin(async (tx) => {
            await applySettings(tx);
            // The callback receives the raw transaction: the GUCs are already
            // applied to it, and re-wrapping it would open a nested transaction
            // whose statements would run scoped to nothing.
            return fn(tx);
          });
      }
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

export function getSql() {
  return getClient();
}

/**
 * Connection for deliberately CROSS-TENANT reads: the federation directory,
 * partnership listings and per-chapter aggregate counters.
 *
 * These are the only queries in the app whose entire purpose is to read other
 * tenants' rows. They are also strictly anonymised -- counts, public chapter
 * names, active department names -- and never expose member identities.
 *
 * They must NOT use ctx.sql. Under tenant RLS (migration 031) every table they
 * touch is strict, so a scoped connection returns only the caller's own chapter
 * and every cross-chapter counter reads 0. That is not an error, it is a
 * plausible-looking empty directory: the federation page would silently render
 * as a single-chapter site with no indication that data was withheld.
 *
 * Using the owner connection here is a conscious, narrow exception. Tenant
 * isolation for real member data is unaffected -- it is enforced by policy on
 * the scoped connection these routes deliberately do not use.
 */
export function getFederationSql() {
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

  // Sequential, never Promise.all (AGENTS.md iron rule 5). Batching these two
  // against the PgBouncer transaction-mode pooler was a latent failure: parallel
  // statements can be handed to different server-side connections, and this runs
  // on EVERY page load via queryTenant.
  const domains = await sql`SELECT * FROM tenant_domains WHERE tenant_id = ${tenant.id}`;
  const flags = await sql`SELECT * FROM feature_flags WHERE tenant_id = ${tenant.id}`;

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
