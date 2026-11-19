import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { buildProof } from "@/lib/proof";

/**
 * GET /api/proof — the signed-in member's own proof read model.
 *
 * No body, no query parameters: the identity and chapter come from the session
 * exactly like every other member surface. `buildProof` is pure, so this route
 * only has to translate the request context into the standard envelope.
 */
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Access denied", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);

  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("TENANT_UNRESOLVED", "No chapter context", 403);

  const proof = await buildProof(sql, { userId: user.id, tenantId: tenant.id });
  return ok(proof);
}
