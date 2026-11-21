import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { revokeTenantSigningKey, rotateTenantSigningKey } from "@/lib/credential-keyring";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rotate") }),
  z.object({
    action: z.literal("revoke"),
    keyId: z.string().min(3).max(120),
    reason: z.string().min(5).max(1000)
  })
]);

function rejected(ctx) {
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  return null;
}

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  const denial = rejected(ctx);
  if (denial) return denial;
  const keys = await ctx.sql`
    SELECT id, key_id, algorithm, public_key_pem, is_active, created_at, revoked_at
    FROM tenant_keyrings WHERE tenant_id = ${ctx.tenant.id}::uuid
    ORDER BY created_at DESC
  `;
  return ok({ keys });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  const denial = rejected(ctx);
  if (denial) return denial;
  let body;
  try {
    body = actionSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }
  if (body.action === "rotate") {
    const key = await rotateTenantSigningKey(ctx.sql, {
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id
    });
    return ok({ key }, { status: 201 });
  }
  const key = await revokeTenantSigningKey(ctx.sql, {
    tenantId: ctx.tenant.id,
    keyId: body.keyId,
    actorId: ctx.user.id,
    reason: body.reason
  });
  if (!key) return fail("NOT_FOUND", "Active signing key not found", 404);
  return ok({ key });
}
