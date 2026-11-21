import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { mergeTenantSettings, parseTenantSettings } from "@/lib/tenant-settings";

const patchSchema = z.object({
  relaxation_window: z.record(z.string(), z.unknown()).optional(),
  dual_head_approval: z.record(z.string(), z.unknown()).optional(),
  public_passport_defaults: z.record(z.string(), z.unknown()).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "Nothing to update");

function contextFailure(ctx) {
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  return null;
}

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  const denied = contextFailure(ctx);
  if (denied) return denied;
  return ok({ settings: parseTenantSettings(ctx.tenant?.settings) });
}

export async function PATCH(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  const denied = contextFailure(ctx);
  if (denied) return denied;
  const { user, tenant, sql } = ctx;

  let patch;
  let settings;
  try {
    patch = patchSchema.parse(await request.json());
    settings = mergeTenantSettings(tenant.settings, patch);
  } catch (error) {
    return validationError(error);
  }

  const [updated] = await sql`
    UPDATE tenants SET settings = ${sql.json(settings)}
    WHERE id = ${tenant.id}::uuid
    RETURNING id, settings
  `;
  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: "tenant_settings.updated",
    resource: "tenant",
    resourceId: tenant.id,
    before: { settings: parseTenantSettings(tenant.settings) },
    after: { settings }
  });
  return ok({ settings: updated.settings });
}
