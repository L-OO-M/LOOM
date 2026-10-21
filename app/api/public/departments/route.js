import { ok } from "@/lib/api";
import { getSql } from "@/lib/db";
import { listPublicDepartments } from "@/lib/departments";
import { getTenantFromRequest } from "@/lib/tenant";

// Public department directory. No auth — tenant is resolved from the host,
// exactly like lib/tenant.js resolveTenantFromHost. Active departments
// only, with real head/co-head names and member counts; no identities
// beyond what the society publishes.
export async function GET(request) {
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
