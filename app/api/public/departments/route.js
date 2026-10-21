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
  // Fail closed. Unauthenticated, and not routed through the fail-closed tenant
  // guard in getRequestContext, so an unresolved tenant previously widened to
  // every chapter. Return empty instead.
  if (!tid) return ok({ departments: [] });
  const sql = getSql();
  let departments = [];
  try {
    departments = await sql`
      SELECT d.id, d.name, d.slug, d.vertical, d.description,
             hp.name AS head_name, cp.name AS co_head_name,
             COALESCE(hd.photo_url, hup.avatar_url) AS head_avatar,
             COALESCE(cd.photo_url, cup.avatar_url) AS co_head_avatar,
             (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members
      FROM departments d
      LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
      LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
      LEFT JOIN user_profiles hup ON hup.user_id = d.head_user_id
      LEFT JOIN user_profiles cup ON cup.user_id = d.co_head_user_id
      LEFT JOIN LATERAL (
        SELECT ld.photo_url FROM lead_directory ld
        WHERE ld.user_id = d.head_user_id AND ld.tenant_id = d.tenant_id AND ld.is_active AND ld.photo_url IS NOT NULL
        ORDER BY ld.is_current DESC, ld.sort_order LIMIT 1
      ) hd ON true
      LEFT JOIN LATERAL (
        SELECT ld.photo_url FROM lead_directory ld
        WHERE ld.user_id = d.co_head_user_id AND ld.tenant_id = d.tenant_id AND ld.is_active AND ld.photo_url IS NOT NULL
        ORDER BY ld.is_current DESC, ld.sort_order LIMIT 1
      ) cd ON true
      WHERE d.tenant_id = ${tid}::uuid
        AND d.is_active
      ORDER BY d.vertical, d.name
    `;
  } catch {
    departments = [];
  }
  return ok({ departments });
}
