import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const patchSchema = z.object({
  draft: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "submitted"]).optional()
}).refine((b) => b.draft !== undefined || b.status !== undefined, {
  message: "Nothing to update — pass draft and/or status"
});

// Single report: dept leads read/submit their own department's, vertical
// leads and admins read everything. Submitted is terminal (admins may reopen).
export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { profile, tenant, sql } = ctx;
  const { id } = await params;
  const tid = tenant?.id ?? null;
  const [report] = await sql`
    SELECT r.*, d.name AS department_name FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    WHERE r.id = ${id} AND (r.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) LIMIT 1
  `;
  if (!report) return fail("NOT_FOUND", "Report not found", 404);
  const admin = isAdmin({ role: profile.role });
  const wide = admin || profile.role === "vertical_lead";
  const mine = (profile.memberships || []).some((m) => m.department_id === report.department_id);
  if (!wide && !mine) return fail("FORBIDDEN", "Only that department's leads, vertical leads, and admins can read reports", 403);
  return ok({ report });
}

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const tid = tenant?.id ?? null;
  const [report] = await sql`
    SELECT * FROM dept_reports WHERE id = ${id}
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) LIMIT 1
  `;
  if (!report) return fail("NOT_FOUND", "Report not found", 404);
  const admin = isAdmin({ role: profile.role });
  const lead = (profile.memberships || []).some((m) => m.department_id === report.department_id && m.level === "dept_lead");
  if (!admin && profile.role !== "vertical_lead" && !lead) {
    return fail("FORBIDDEN", "Only that department's Head/Co-Head can edit or submit its report", 403);
  }
  if (report.status === "submitted" && body.status === "submitted" && !admin) {
    return fail("FORBIDDEN", "Report is already submitted — only an admin can reopen it", 403);
  }
  const next = await sql`
    UPDATE dept_reports SET
      draft = COALESCE(${body.draft !== undefined ? sql.json(body.draft) : null}, draft),
      status = COALESCE(${body.status ?? null}, status),
      submitted_by = CASE WHEN ${body.status ?? null} = 'submitted' THEN ${user.id} ELSE submitted_by END,
      submitted_at = CASE WHEN ${body.status ?? null} = 'submitted' THEN NOW() ELSE submitted_at END
    WHERE id = ${id}
    RETURNING *
  `.then((rows) => rows[0]);
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: body.status === "submitted" ? "submitted_report" : "edited_report",
    resource: "report", resourceId: id, before: { status: report.status }, after: { status: next.status }
  });
  return ok({ report: next });
}
