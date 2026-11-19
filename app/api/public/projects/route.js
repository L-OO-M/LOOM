import { fail, ok } from "@/lib/api";
import { getSql } from "@/lib/db";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Public project showcase. No auth — tenant is resolved from the host,
// exactly like lib/tenant.js resolveTenantFromHost. Only real student
// builds; an empty list means nothing is showcased yet.
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
  // Fail closed. This endpoint is unauthenticated and does NOT pass through the
  // fail-closed tenant guard in getRequestContext, so an unresolved tenant used
  // to widen the query to every chapter (the `OR tid IS NULL` arm). Return empty
  // instead — a public showcase with no chapter is legitimately empty.
  if (!tid) return ok({ projects: [] });
  const sql = getSql();
  let projects = [];
  try {
    projects = await sql`
      SELECT p.id, p.title, p.description, p.repo_url, p.tags,
             p.status, p.created_at, pr.name AS owner_name
      FROM projects p
      JOIN profiles pr ON pr.user_id = p.owner_id AND pr.tenant_id = p.tenant_id
      JOIN user_profiles up ON up.user_id = p.owner_id AND up.tenant_id = p.tenant_id
      WHERE p.tenant_id = ${tid}::uuid
        AND up.is_public = true
      ORDER BY p.created_at DESC
      LIMIT 24
    `;
  } catch {
    projects = [];
  }
  return ok({ projects });
}
