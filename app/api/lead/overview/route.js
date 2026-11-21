import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { getLeadOverview } from "@/lib/lead";
import { can } from "@/lib/permissions";

// Thin wrapper — the query lives in lib/lead.js, shared with the page.
export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const subject = {
    id: user.id,
    tenantId: tenant.id,
    role: profile.role,
    vertical: profile.vertical || null,
    memberships: profile.memberships || [],
    scopedGrants: profile.scopedGrants || [],
    roleTermEnd: profile.roleTermEnd ?? profile.role_term_end ?? null,
    isPlatformAdmin: !!profile.isPlatformAdmin
  };
  if (!can(subject, "manage_handover").ok) {
    return fail("FORBIDDEN", "Lead console is for department and vertical leads", 403);
  }
  const { searchParams } = new URL(request.url);
  const data = await getLeadOverview(sql, {
    userId: user.id, profile, tenant,
    verticalOverride: searchParams.get("vertical")
  });
  return ok(data);
}
