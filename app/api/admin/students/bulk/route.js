import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const bulkSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(50),
  role: z.enum(["student", "core", "dept_lead", "vertical_lead", "admin"])
});

// Bulk role assignment for the user-management table. Super Admin only,
// audited once with the full list. Membership levels are untouched — use
// the department grant endpoints for those.
export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = bulkSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const rows = await sql`
    UPDATE profiles SET role = ${body.role}, updated_at = NOW()
    WHERE user_id = ANY(${body.userIds})
      AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    RETURNING user_id
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "bulk_role_assign",
    resource: "profile", resourceId: `${rows.length}-users`, after: { role: body.role, userIds: rows.map((r) => r.user_id) }
  });
  return ok({ updated: rows.length });
}
