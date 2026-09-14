import { ok } from "@/lib/api";
import { getSql } from "@/lib/db";
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
  const sql = getSql();
  let departments = [];
  try {
    departments = await sql`
      SELECT d.id, d.name, d.slug, d.vertical, d.description,
             hp.name AS head_name, cp.name AS co_head_name,
             (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members
      FROM departments d
      LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
      LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
      WHERE (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
        AND d.is_active
      ORDER BY d.vertical, d.name
    `;
  } catch {
    departments = [];
  }
  return ok({ departments });
}
