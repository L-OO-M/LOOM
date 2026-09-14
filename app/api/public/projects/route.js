import { ok } from "@/lib/api";
import { getSql } from "@/lib/db";
import { getTenantFromRequest } from "@/lib/tenant";

// Public project showcase. No auth — tenant is resolved from the host,
// exactly like lib/tenant.js resolveTenantFromHost. Only real student
// builds; an empty list means nothing is showcased yet.
export async function GET(request) {
  let tenant = null;
  try {
    tenant = await getTenantFromRequest(request);
  } catch {
    tenant = null;
  }
  const tid = tenant?.id ?? null;
  const sql = getSql();
  let projects = [];
  try {
    projects = await sql`
      SELECT p.id, p.title, p.description, p.repo_url, p.tags,
             p.status, p.created_at, pr.name AS owner_name
      FROM projects p
      LEFT JOIN profiles pr ON pr.user_id = p.owner_id
      WHERE (p.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      ORDER BY p.created_at DESC
      LIMIT 24
    `;
  } catch {
    projects = [];
  }
  return ok({ projects });
}
