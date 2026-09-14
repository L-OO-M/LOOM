import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { getLeadOverview } from "@/lib/lead";

// Thin wrapper — the query lives in lib/lead.js, shared with the page.
export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!["dept_lead", "vertical_lead", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Lead console is for department and vertical leads", 403);
  }
  const { searchParams } = new URL(request.url);
  const data = await getLeadOverview(sql, {
    userId: user.id, profile, tenant,
    verticalOverride: searchParams.get("vertical")
  });
  return ok(data);
}
