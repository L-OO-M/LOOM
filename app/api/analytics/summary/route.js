import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { getAnalyticsSummary, normalizePeriod } from "@/lib/analytics";

const querySchema = z.object({
  period: z.enum(["daily", "monthly", "yearly"]).optional().default("monthly"),
});

// Chapter analytics for the SaaS dashboard. Admin-only: aggregates are
// chapter-wide. Any signed-in user gets 401 logged-out / 403 wrong role.
export async function GET(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  let query;
  try {
    query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  } catch (e) {
    return validationError(e);
  }
  try {
    const summary = await getAnalyticsSummary(sql, tenant?.id ?? null, normalizePeriod(query.period));
    return ok(summary);
  } catch (e) {
    return fail("ANALYTICS_FAILED", "Unable to load analytics", 500);
  }
}
