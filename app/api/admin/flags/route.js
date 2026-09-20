import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const upsertSchema = z.object({
  key: z.string().min(1).max(80),
  enabled: z.boolean()
});

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const rows = await sql`SELECT * FROM feature_flags WHERE tenant_id = ${tenant?.id} ORDER BY key ASC`;
  return ok({ flags: rows });
}

export async function PATCH(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = upsertSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [before] = await sql`SELECT * FROM feature_flags WHERE tenant_id = ${tenant?.id} AND key = ${body.key} LIMIT 1`;
  const [flag] = await sql`
    INSERT INTO feature_flags (tenant_id, key, enabled)
    VALUES (${tenant?.id}, ${body.key}, ${body.enabled})
    ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_feature_flag", resource: "feature_flag", resourceId: body.key, before: { enabled: before?.enabled }, after: { enabled: body.enabled } });
  return ok({ flag });
}
