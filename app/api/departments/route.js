import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

// List active departments in the tenant with member counts and the
// caller's membership level. Authenticated; public catalog arrives with
// the public pages (domain pages read this same shape).
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const rows = await sql`
    SELECT d.id, d.name, d.slug, d.vertical, d.description, d.is_active,
      d.head_user_id, d.co_head_user_id,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members,
      (SELECT level FROM department_memberships WHERE department_id = d.id AND user_id = ${user.id}) AS my_level,
      (SELECT core_requested FROM department_memberships WHERE department_id = d.id AND user_id = ${user.id}) AS core_requested
    FROM departments d
    WHERE d.is_active AND (d.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    ORDER BY d.vertical, d.name
  `;
  return ok({ departments: rows });
}
