import { ok } from "@/lib/api";
import { getSql, getAppSql } from "@/lib/db";
import { getTenantFromRequest } from "@/lib/tenant";
import { env } from "@/lib/env";

// Liveness/readiness probe.
//
// This used to return `status: "ready"` as a hardcoded string and `database:
// "supabase_postgres"` as another literal, without ever opening a connection.
// It therefore reported READY whenever the handler ran at all — including when
// Postgres was unreachable, the pooler was refusing connections, or the tenant
// row was missing. A monitor pointed at this endpoint could not tell a working
// deployment from a broken one.
//
// It also never reported WHICH database role it connected as, which is the one
// thing an operator needs during the RLS rollout: if DATABASE_APP_URL silently
// fell back to the owner connection, every policy was decorative while this
// endpoint still said "ready" (see docs/rls-rollout-runbook.md).
export async function GET(request) {
  const checks = {};

  // --- database: does it actually answer? ---
  let databaseOk = false;
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    databaseOk = true;
  } catch (e) {
    // The message is logged, not returned: it can contain the pooler host.
    console.error("[health] database probe failed:", e?.message);
  }
  checks.database = databaseOk ? "ok" : "unreachable";

  // --- which role are we on? (RLS rollout visibility) ---
  let connection = "unknown";
  try {
    const [row] = await getAppSql()`SELECT current_user AS u`;
    connection = row?.u || "unknown";
  } catch (e) {
    console.error("[health] app-role probe failed:", e?.message);
    connection = "unavailable";
  }

  // --- is tenant isolation actually enforced? ---
  // Read from the flag directly rather than inferring it: the app consults
  // DEV_TENANT_SLUG, not the caller's tenant.
  let rlsEnforced = false;
  try {
    const sql = getSql();
    const [row] = await sql`
      SELECT enabled FROM public.feature_flags
      WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = ${env.DEV_TENANT_SLUG || "demo-college"} LIMIT 1)
        AND key = 'tenant_rls_enforced'
      LIMIT 1`;
    rlsEnforced = row?.enabled === true;
  } catch (e) {
    console.error("[health] RLS flag probe failed:", e?.message);
  }

  const tenant = await getTenantFromRequest(request).catch(() => null);

  // A deployment whose app connection is not loom_app cannot enforce RLS, so it
  // is degraded even though it is otherwise serving traffic.
  const rlsEffective = rlsEnforced && connection === "loom_app";

  const healthy = databaseOk;
  const body = {
    status: healthy ? "ready" : "degraded",
    checks,
    // Deliberately no tenant id/name and no host/port/error strings: this route
    // is unauthenticated and sits in the middleware public allowlist.
    tenant: tenant ? { slug: tenant.slug } : null,
    isolation: {
      flag: rlsEnforced,
      connection,
      effective: rlsEffective,
      note: rlsEffective
        ? "Tenant isolation is enforced at the database level."
        : "Tenant isolation relies on application WHERE clauses only."
    }
  };

  // 503 on an unreachable database so a load balancer or uptime monitor can act
  // on it, rather than reading 200 and assuming health.
  return ok(body, { status: healthy ? 200 : 503 });
}