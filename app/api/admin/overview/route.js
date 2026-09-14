import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

// Super Admin command deck: per-department cards (heads, size, freshness,
// pipeline) plus the approval counts that open the day. Admin only.
export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const departments = await sql`
    SELECT d.id, d.name, d.slug, d.vertical, d.is_active,
      hp.name AS head_name, cp.name AS co_head_name,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id AND m.core_requested AND m.level = 'general') AS core_requests,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id AND m.succession_ready) AS successors,
      (SELECT MAX(c.created_at) FROM member_contributions c WHERE c.department_id = d.id) AS last_activity,
      (SELECT COUNT(*)::int FROM events e WHERE e.department_id = d.id AND e.starts_at >= NOW() AND e.status <> 'cancelled') AS upcoming_workshops
    FROM departments d
    LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
    LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
    WHERE (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY d.vertical, d.name
  `;
  const [mentorApps] = await sql`SELECT COUNT(*)::int AS c FROM mentor_applications WHERE status = 'pending' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)`;
  const [ossClaims] = await sql`SELECT COUNT(*)::int AS c FROM student_oss_contributions WHERE status = 'claimed' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)`;
  const [proposed] = await sql`SELECT COUNT(*)::int AS c FROM events WHERE status = 'proposed' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)`;
  const [flags] = await sql`SELECT COUNT(*)::int AS c FROM forum_flags WHERE created_at >= NOW() - INTERVAL '7 days'`;

  return ok({
    departments,
    pending: {
      coreRequests: departments.reduce((s, d) => s + (d.core_requests || 0), 0),
      mentorApplications: mentorApps?.c ?? 0,
      ossClaims: ossClaims?.c ?? 0,
      proposedEvents: proposed?.c ?? 0,
      contentFlags: flags?.c ?? 0
    }
  });
}
