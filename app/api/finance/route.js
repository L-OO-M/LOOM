import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { can, isAdmin } from "@/lib/permissions";

// Finance snapshot: budget heads with approved spend, pending expenses, and
// the sponsorship pipeline. Admins see everything; vertical leads see their
// own vertical's departments plus society-wide (vertical IS NULL) rows.
// Dept leads and below get 403 — proposing goes through /expenses.
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const admin = isAdmin(me);
  if (!admin && !can(me, "view_finance", { vertical: profile.vertical }).ok) {
    return fail("FORBIDDEN", "Finance is visible to admins and vertical leads", 403);
  }
  const tid = tenant?.id ?? null;
  const vertical = admin ? null : profile.vertical;

  const heads = await sql`
    SELECT h.*,
      COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.head_id = h.id AND e.status = 'approved'
          AND (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)), 0)::numeric AS spent
    FROM budget_heads h
    WHERE (h.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND (${vertical ? sql`(h.vertical = ${vertical} OR h.vertical IS NULL)` : sql`TRUE`})
    ORDER BY h.name ASC
  `;
  const expenses = await sql`
    SELECT e.*, h.name AS head_name, h.vertical AS head_vertical, d.name AS department_name, d.vertical AS dept_vertical,
      p.name AS proposed_by_name
    FROM expenses e
    LEFT JOIN budget_heads h ON h.id = e.head_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN profiles p ON p.user_id = e.created_by
    WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND (${vertical ? sql`((h.vertical = ${vertical} OR (h.vertical IS NULL AND (d.vertical = ${vertical} OR e.department_id IS NULL))))` : sql`TRUE`})
    ORDER BY e.created_at DESC
    LIMIT 200
  `;
  const sponsorships = await sql`
    SELECT * FROM sponsorships
    WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY created_at DESC
    LIMIT 200
  `;
  const byStatus = { pipeline: 0, committed: 0, received: 0 };
  for (const s of sponsorships) {
    if (byStatus[s.status] !== undefined) byStatus[s.status] += Number(s.amount) || 0;
  }
  return ok({
    heads: heads.map((h) => ({
      ...h,
      remaining: Number(h.allocated) - Number(h.spent)
    })),
    expenses,
    pending: expenses.filter((e) => e.status === "proposed"),
    sponsorships,
    sponsorships_by_status: byStatus,
    // Vertical leads see approve_budget as recommend_only: they can propose
    // and comment, but only admins decide (PATCH /expenses is admin-gated).
    can_decide: admin,
    recommend_only: !admin
  });
}
