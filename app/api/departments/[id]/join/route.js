import { ok, fail } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

// Instant, approval-free department join as General Member (Plan Section 6).
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
  const [membership] = await sql`
    INSERT INTO department_memberships (user_id, department_id, level)
    VALUES (${user.id}, ${dept.id}, 'general')
    ON CONFLICT (user_id, department_id) DO NOTHING
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "joined_department", resource: "department", resourceId: dept.id, after: { slug: dept.slug } });
  return ok({ membership: membership ?? null, alreadyMember: !membership }, { status: 201 });
}
