import { fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { can, isAdmin } from "@/lib/permissions";
import { loadReportExport, reportCsv, reportPdf } from "@/lib/report-export";

const FORMATS = new Set(["json", "csv", "pdf"]);

// Report export: submitted dept_reports plus live counts, rendered as JSON,
// CSV or PDF. All three formats come from one `loadReportExport` call, so the
// figures cannot drift between downloads. Admins and vertical leads only
// (export_reports); a VL only sees their own vertical.
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
  const period = searchParams.get("scope") === "annual" ? "annual" : "semester";
  const format = FORMATS.has(searchParams.get("format")) ? searchParams.get("format") : "json";

  const payload = await loadReportExport({
    sql,
    tenantId: tenant?.id ?? null,
    scopeParam: period,
    viewer: { role: profile.role, vertical: profile.vertical }
  });

  if (format === "csv") {
    return new Response(reportCsv(payload), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="loom-reports-${period}.csv"`,
        "cache-control": "private, no-store"
      }
    });
  }
  if (format === "pdf") {
    return new Response(reportPdf(payload), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="loom-reports-${period}.pdf"`,
        "cache-control": "private, no-store"
      }
    });
  }
  return new Response(JSON.stringify({ ok: true, data: payload }, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="loom-reports-${period}.json"`,
      "cache-control": "private, no-store"
    }
  });
}
