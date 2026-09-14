import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const compileSchema = z.object({
  departmentId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "month must be YYYY-MM or YYYY-MM-DD")
});

function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString(), firstDay: `${month.slice(0, 7)}-01` };
}

function canReadReport({ profile }, departmentId) {
  const me = { id: profile.user_id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  if (isAdmin(me)) return true;
  if (profile.role === "vertical_lead") return true;
  return (profile.memberships || []).some((m) => m.department_id === departmentId && (m.level === "dept_lead" || m.level === "core"));
}

function canWriteReport({ profile }, departmentId) {
  const me = { id: profile.user_id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  if (isAdmin(me)) return true;
  if (profile.role === "vertical_lead") return true;
  return (profile.memberships || []).some((m) => m.department_id === departmentId && m.level === "dept_lead");
}

// Monthly department reports: list (own departments for leads, all for
// VL/admin) + auto-compile a draft from live counts.
export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { profile, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const departmentId = searchParams.get("departmentId");
  const tid = tenant?.id ?? null;
  if (status && !["draft", "submitted"].includes(status)) {
    return fail("VALIDATION_ERROR", "status must be draft or submitted", 400);
  }
  const admin = isAdmin({ role: profile.role });
  const wide = admin || profile.role === "vertical_lead";
  const mine = (profile.memberships || []).map((m) => m.department_id);
  if (!wide && mine.length === 0) return ok({ reports: [] });
  const rows = await sql`
    SELECT r.*, d.name AS department_name, d.vertical, p.name AS submitted_by_name
    FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    LEFT JOIN profiles p ON p.user_id = r.submitted_by
    WHERE (r.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND (${departmentId ? sql`r.department_id = ${departmentId}` : sql`TRUE`})
      AND (${status ? sql`r.status = ${status}` : sql`TRUE`})
      AND (${wide ? sql`TRUE` : sql`r.department_id = ANY(${mine})`})
    ORDER BY r.month DESC, d.name ASC
    LIMIT 100
  `;
  return ok({ reports: rows.filter((r) => wide || canReadReport(ctx, r.department_id)) });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  let body;
  try {
    body = compileSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (!canWriteReport(ctx, body.departmentId)) {
    return fail("FORBIDDEN", "Only that department's Head/Co-Head (or a vertical lead / admin) can compile its report", 403);
  }
  const tid = tenant?.id ?? null;
  const [dept] = await sql`
    SELECT * FROM departments WHERE id = ${body.departmentId}
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) LIMIT 1
  `;
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);
  const { start, end, firstDay } = monthRange(body.month);

  const byKind = await sql`
    SELECT kind, COUNT(*)::int AS c FROM member_contributions
    WHERE department_id = ${body.departmentId}
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
    GROUP BY kind
  `;
  const held = await sql`
    SELECT id, title, starts_at FROM events
    WHERE department_id = ${body.departmentId}
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND status = 'past'
      AND starts_at >= ${start}::timestamptz AND starts_at < ${end}::timestamptz
    ORDER BY starts_at ASC
  `;
  const upcoming = await sql`
    SELECT id, title, starts_at, status FROM events
    WHERE department_id = ${body.departmentId}
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND status IN ('upcoming', 'live') AND starts_at >= NOW()
    ORDER BY starts_at ASC LIMIT 10
  `;
  const [{ c: newMembers }] = await sql`
    SELECT COUNT(*)::int AS c FROM department_memberships m
    WHERE m.department_id = ${body.departmentId}
      AND m.joined_at >= ${start}::timestamptz AND m.joined_at < ${end}::timestamptz
  `;
  const contributionsByKind = Object.fromEntries(byKind.map((r) => [r.kind, r.c]));
  const draft = {
    month: firstDay,
    compiled_at: new Date().toISOString(),
    contributions_by_kind: contributionsByKind,
    contributions_total: Object.values(contributionsByKind).reduce((s, n) => s + n, 0),
    events_held: held.length,
    events_held_titles: held.map((e) => e.title),
    new_members: newMembers ?? 0,
    workshops_upcoming: upcoming.length,
    workshops_upcoming_titles: upcoming.map((e) => e.title)
  };
  const [report] = await sql`
    INSERT INTO dept_reports (tenant_id, department_id, month, draft, status)
    VALUES (${tid}, ${body.departmentId}, ${firstDay}, ${sql.json(draft)}, 'draft')
    ON CONFLICT (department_id, month) DO UPDATE SET draft = ${sql.json(draft)}
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "compiled_report",
    resource: "report", resourceId: report.id,
    after: { departmentId: body.departmentId, month: firstDay }
  });
  return ok({ report }, { status: 201 });
}
