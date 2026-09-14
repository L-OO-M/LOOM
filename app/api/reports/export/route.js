import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { can, isAdmin } from "@/lib/permissions";

// Report export: submitted dept_reports plus live counts, compiled into a
// JSON download. Admins and vertical leads only (export_reports).
export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  if (!isAdmin(me) && !can(me, "export_reports", {}).ok) {
    return fail("FORBIDDEN", "Only vertical leads and admins can export reports", 403);
  }
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "annual" ? "annual" : "semester";
  const tid = tenant?.id ?? null;
  const months = scope === "annual" ? 12 : 6;
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (months - 1), 1)).toISOString();

  const reports = await sql`
    SELECT r.*, d.name AS department_name, d.vertical, p.name AS submitted_by_name
    FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    LEFT JOIN profiles p ON p.user_id = r.submitted_by
    WHERE r.status = 'submitted'
      AND (r.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND r.month >= ${since}::date
      AND (${me.role === "vertical_lead" && !isAdmin(me) ? sql`d.vertical = ${profile.vertical}` : sql`TRUE`})
    ORDER BY r.month DESC, d.name ASC
  `;
  const contributions = await sql`
    SELECT c.department_id, c.kind, COUNT(*)::int AS n FROM member_contributions c
    JOIN departments d ON d.id = c.department_id
    WHERE (c.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND c.created_at >= ${since}::timestamptz
      AND (${me.role === "vertical_lead" && !isAdmin(me) ? sql`d.vertical = ${profile.vertical}` : sql`TRUE`})
    GROUP BY c.department_id, c.kind
  `;
  const memberships = await sql`
    SELECT m.department_id, COUNT(*)::int AS n FROM department_memberships m
    JOIN departments d ON d.id = m.department_id
    WHERE (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND (${me.role === "vertical_lead" && !isAdmin(me) ? sql`d.vertical = ${profile.vertical}` : sql`TRUE`})
    GROUP BY m.department_id
  `;
  const payload = {
    scope,
    exported_at: new Date().toISOString(),
    tenant_id: tid,
    submitted_reports: reports,
    contribution_counts: contributions,
    membership_counts: memberships
  };
  return new Response(JSON.stringify({ ok: true, data: payload }, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="loom-reports-${scope}.json"`
    }
  });
}
