import { ok, fail } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

// One-click Core Member request (Plan Section 6). Joining as General is
// instant, so a missing membership is created first — never a dead end.
export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  const [dept] = await sql`
    SELECT * FROM departments WHERE id = ${id}
      AND is_active AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    LIMIT 1
  `;
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);
  const [existing] = await sql`
    SELECT * FROM department_memberships WHERE user_id = ${user.id} AND department_id = ${dept.id} LIMIT 1
  `;
  if (existing && existing.level !== "general") {
    return ok({ membership: existing, alreadyElevated: true });
  }
  const [membership] = await sql`
    INSERT INTO department_memberships (user_id, department_id, level, core_requested)
    VALUES (${user.id}, ${dept.id}, 'general', true)
    ON CONFLICT (user_id, department_id) DO UPDATE SET core_requested = true
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "requested_core", resource: "department", resourceId: dept.id, after: { slug: dept.slug } });
  return ok({ membership }, { status: 201 });
}
