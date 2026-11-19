import { fail, ok } from "@/lib/api";
import { getSql } from "@/lib/db";
import { listPublicDepartments } from "@/lib/departments";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Public department directory. No auth — tenant is resolved from the host,
// exactly like lib/tenant.js resolveTenantFromHost. Active departments
// only, with real head/co-head names and member counts; no identities
// beyond what the society publishes.
export async function GET(request) {
  // Public and unauthenticated: unlimited calls are unlimited database work.
  // One shared per-IP budget for the read-only public surface; a real page view
  // never comes close to it.
  const rl = await checkRateLimit(request, { durable: true, limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    const r = rateLimitResponse(rl.retryAfter);
    return fail(r.error.code, r.error.message, 429);
  }

  let tenant = null;
  try {
    tenant = await getTenantFromRequest(request);
  } catch {
    tenant = null;
  }
  const tid = tenant?.id ?? null;
  // Fail closed. Unauthenticated, and not routed through the fail-closed tenant
  // guard in getRequestContext, so an unresolved tenant previously widened to
  // every chapter. Return empty instead.
  if (!tid) return ok({ departments: [] });
  const sql = getSql();
  let departments = [];
  try {
    departments = await listPublicDepartments(sql, { tenantId: tid });
  } catch {
    departments = [];
  }
  return ok({ departments });
}
