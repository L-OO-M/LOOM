import { scope } from "@/lib/tenant-scope";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { hasVerticalLeadGrant, isAdmin, termExpired } from "@/lib/permissions";
import { listReportRevisions, recordReportRevision } from "@/lib/report-revisions";
import { REPORT_NARRATIVE_LIMIT } from "@/lib/report-export";

const patchSchema = z.object({
  draft: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "submitted"]).optional(),
  narrative: z.string().max(
    REPORT_NARRATIVE_LIMIT,
    `narrative must be ${REPORT_NARRATIVE_LIMIT} characters or fewer`
  ).optional()
}).refine((b) => b.draft !== undefined || b.status !== undefined || b.narrative !== undefined, {
  message: "Nothing to update - pass draft, status and/or narrative"
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
    SELECT r.*, d.name AS department_name, d.vertical FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    WHERE r.id = ${id} AND r.tenant_id = ${scope(tid)}::uuid LIMIT 1
  `;
  if (!report) return fail("NOT_FOUND", "Report not found", 404);
  const admin = isAdmin({ role: profile.role });
  const verticalLead = profile.role === "vertical_lead" && hasVerticalLeadGrant({
    id: profile.user_id,
    tenantId: tid,
    scopedGrants: profile.scopedGrants || []
  }, report.vertical);
  const wide = admin || verticalLead;
  const mine = (profile.memberships || []).some((m) => m.department_id === report.department_id);
  if (!wide && !mine) return fail("FORBIDDEN", "Only that department's leads, vertical leads, and admins can read reports", 403);
  const revisions = await listReportRevisions({ sql, reportId: report.id, tenantId: tid });
  return ok({ report, revisions });
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
    SELECT r.*, d.vertical FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    WHERE r.id = ${id}
      AND r.tenant_id = ${scope(tid)}::uuid LIMIT 1
  `;
  if (!report) return fail("NOT_FOUND", "Report not found", 404);
  const admin = isAdmin({ role: profile.role });
  const lead = (profile.memberships || []).some((m) =>
    m.department_id === report.department_id &&
    m.level === "dept_lead" &&
    !termExpired(m.term_end)
  );
  const verticalLead = profile.role === "vertical_lead" && hasVerticalLeadGrant({
    id: user.id,
    tenantId: tid,
    scopedGrants: profile.scopedGrants || []
  }, report.vertical);
  if (!admin && !verticalLead && !lead) {
    return fail("FORBIDDEN", "Only that department's Head/Co-Head can edit or submit its report", 403);
  }
  if (report.status === "submitted" && !admin) {
    return fail("FORBIDDEN", "Report is locked once submitted — only an admin can reopen it", 403);
  }
  const next = await sql`
    UPDATE dept_reports SET
      draft = COALESCE(${body.draft !== undefined ? sql.json(body.draft) : null}, draft),
      status = COALESCE(${body.status ?? null}, status),
      narrative = COALESCE(${body.narrative ?? null}, narrative),
      submitted_by = CASE WHEN ${body.status ?? null} = 'submitted' THEN ${user.id} ELSE submitted_by END,
      submitted_at = CASE WHEN ${body.status ?? null} = 'submitted' THEN NOW() ELSE submitted_at END
    WHERE id = ${id} AND tenant_id = ${scope(tid)}::uuid
    RETURNING *
  `.then((rows) => rows[0]);
  const revision = await recordReportRevision({ sql, report: next, actorId: user.id });
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: body.status === "submitted" ? "submitted_report" : "edited_report",
    resource: "report", resourceId: id, before: { status: report.status },
    after: { status: next.status, revision: revision?.revision ?? null }
  });
  return ok({ report: next });
}
