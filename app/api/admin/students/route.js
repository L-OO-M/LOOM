import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

export async function GET(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const rows = q
    ? await sql`SELECT * FROM profiles WHERE (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) AND (name ILIKE ${"%" + q + "%"} OR user_id ILIKE ${"%" + q + "%"}) ORDER BY updated_at DESC LIMIT 50`
    : await sql`SELECT * FROM profiles WHERE (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) ORDER BY updated_at DESC LIMIT 50`;
  return ok({ students: rows });
}

const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(["student", "core", "dept_lead", "vertical_lead", "admin"]) });

export async function PATCH(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = roleSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [target] = await sql`SELECT * FROM profiles WHERE user_id = ${body.userId} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
  if (!target) return fail("NOT_FOUND", "Student not in your college", 404);
  const [updated] = await sql`UPDATE profiles SET role = ${body.role}, updated_at = NOW() WHERE user_id = ${body.userId} RETURNING *`;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_student_role", resource: "profile", resourceId: body.userId, before: { role: target.role }, after: { role: body.role } });
  return ok({ profile: updated });
}
