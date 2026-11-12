import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { loadSuccessionOverview } from "@/lib/succession";

// Unified succession read model: checklist + briefs + transfer flags + terms,
// outstanding first. Admin only; the page renders the same function directly.
export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  const overview = await loadSuccessionOverview({ sql, tenantId: tenant.id });
  return ok(overview);
}
