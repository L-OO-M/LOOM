import { scope } from "@/lib/tenant-scope";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Download, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import "../_components/admin-ledger.css";

const PAGE_SIZE = 25;

function monthValue(value) {
  return /^\d{4}-\d{2}$/.test(String(value || "")) ? value : "";
}

export default async function AdminReportsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/reports");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/reports");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const dept = (sp?.dept || "").trim();
  const month = monthValue(sp?.month);
  const page = Math.max(1, parseInt(sp?.page || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM dept_reports WHERE status = 'submitted' AND tenant_id = ${scope(tid)}::uuid) AS submitted,
      (SELECT COUNT(*)::int FROM dept_reports WHERE status = 'draft' AND tenant_id = ${scope(tid)}::uuid) AS drafts,
      (SELECT COUNT(DISTINCT department_id)::int FROM dept_reports WHERE status = 'submitted' AND tenant_id = ${scope(tid)}::uuid) AS depts
  `;

  const departments = await sql`
    SELECT slug, name FROM departments
    WHERE is_active AND tenant_id = ${scope(tid)}::uuid
    ORDER BY name
  `;

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS total
    FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    LEFT JOIN profiles p ON p.user_id = r.submitted_by
    WHERE r.status = 'submitted'
      AND r.tenant_id = ${scope(tid)}::uuid
      AND (${q ? sql`(d.name ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${dept ? sql`d.slug = ${dept}` : sql`TRUE`})
      AND (${month ? sql`r.month = ${`${month}-01`}::date` : sql`TRUE`})
  `;
  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const safeOffset = (currentPage - 1) * PAGE_SIZE;

  const reports = await sql`
    SELECT r.*, d.name AS department_name, p.name AS submitted_by_name
    FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    LEFT JOIN profiles p ON p.user_id = r.submitted_by
    WHERE r.status = 'submitted'
      AND r.tenant_id = ${scope(tid)}::uuid
      AND (${q ? sql`(d.name ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${dept ? sql`d.slug = ${dept}` : sql`TRUE`})
      AND (${month ? sql`r.month = ${`${month}-01`}::date` : sql`TRUE`})
    ORDER BY r.month DESC, d.name ASC
    LIMIT ${PAGE_SIZE} OFFSET ${safeOffset}
  `;

  const activeFilters = [q && `search: ${q}`, dept && `department: ${dept}`, month && `month: ${month}`].filter(Boolean);

  function pageHref(nextPage) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (dept) params.set("dept", dept);
    if (month) params.set("month", month);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/reports?${qs}` : "/admin/reports";
  }

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Reports / ${stats?.submitted ?? 0} submitted / ${stats?.drafts ?? 0} drafts`}
          title="Department reports"
          lede="Submitted monthly documents - coverage, submissions, and growth. Draft until a Head submits; then immutable."
          meta={`${stats?.depts ?? 0} reporting departments / ${total} matching submitted reports / page ${currentPage} of ${totalPages}`}
          tone="ledger"
          art="/storyloom/learning.png"
          artAlt=""
          stats={[
            { value: stats?.submitted ?? 0, label: "submitted" },
            { value: stats?.drafts ?? 0, label: "drafts unsubmitted" },
            { value: stats?.depts ?? 0, label: "departments reporting" }
          ]}
          actions={
            <Link href="/admin" prefetch={false} style={{ color: "var(--accent)" }} className="aled-meta">
              Back to overview
            </Link>
          }
        />

        <WorkspaceSection index="01" title="Export" note="Draft -> submitted -> exported. Exports include submitted reports only." action={<span className="aled-meta">JSON</span>}>
          <div className="aled-panel" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
            <span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <Download size={12} style={{ color: "var(--accent)" }} aria-hidden="true" /> Export submitted reports
            </span>
            <span className="aled-actions" style={{ marginLeft: "auto" }}>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file downloads must stay raw <a>; Link would client-navigate instead of downloading */}
              <a href="/api/reports/export?scope=semester" className="btn-ink inline-flex items-center gap-1.5 !py-1.5 text-xs">
                <Download size={12} aria-hidden="true" /> Semester
              </a>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file downloads must stay raw <a>; Link would client-navigate instead of downloading */}
              <a href="/api/reports/export?scope=annual" className="aled-tag aled-tag--accent" style={{ padding: "0.4rem 0.6rem" }}>
                <Download size={12} aria-hidden="true" /> Annual
              </a>
            </span>
          </div>
        </WorkspaceSection>

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search department or submitter" aria-label="Search reports" />
          </label>
          <select name="dept" defaultValue={dept} className="aled-select" aria-label="Filter by department">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
          <input name="month" defaultValue={month} type="month" className="aled-select" aria-label="Filter by month" />
          <button className="btn-ink !py-2 text-xs">Filter</button>
          {(q || dept || month) && <Link href="/admin/reports" prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{total} matching</span>
        </form>

        {activeFilters.length > 0 && (
          <div className="aled-toolbar" style={{ borderTop: "none", paddingTop: 0 }}>
            <span className="aled-meta">Active</span>
            {activeFilters.map((f) => <span key={f} className="aled-tag">{f}</span>)}
          </div>
        )}

        <WorkspaceSection index="02" title="Submitted reports" note="Each row shows the department, month, and the headline numbers recorded at submission." action={<span className="aled-meta">{reports.length} shown / {total} matched</span>}>
          {reports.length === 0 ? (
            <WorkspaceEmpty
              title={q || dept || month ? "No reports match these filters" : "No submitted reports yet"}
              body={q || dept || month
                ? "Try another department, month, or search term."
                : "Once department Heads submit from the lead console, they appear here ready to export."}
            />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {reports.map((r) => (
                <li key={r.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title">
                      {r.department_name} / {new Date(`${r.month}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
                    </span>
                    <p className="aled-sub">
                      {r.draft?.contributions_total ?? 0} contributions / {r.draft?.events_held ?? 0} events / {r.draft?.new_members ?? 0} new members
                      {r.submitted_by_name ? ` / by ${r.submitted_by_name}` : ""}
                    </p>
                  </div>
                  <span className="aled-tag aled-tag--success">
                    <FileText size={10} aria-hidden="true" /> Submitted
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        {totalPages > 1 && (
          <nav className="aled-toolbar" aria-label="Report pages">
            <Link
              href={pageHref(Math.max(1, currentPage - 1))}
              prefetch={false}
              aria-disabled={currentPage === 1}
              className="btn-ink !py-1.5 text-xs"
              style={{ opacity: currentPage === 1 ? 0.45 : 1, pointerEvents: currentPage === 1 ? "none" : "auto" }}
            >
              Previous
            </Link>
            <span className="aled-meta">Page {currentPage} of {totalPages}</span>
            <Link
              href={pageHref(Math.min(totalPages, currentPage + 1))}
              prefetch={false}
              aria-disabled={currentPage === totalPages}
              className="btn-ink !py-1.5 text-xs"
              style={{ opacity: currentPage === totalPages ? 0.45 : 1, pointerEvents: currentPage === totalPages ? "none" : "auto" }}
            >
              Next
            </Link>
          </nav>
        )}
      </main>
    </AppShell>
  );
}
