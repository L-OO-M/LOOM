import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Download } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import "../_components/admin-ledger.css";

export default async function AdminReportsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/reports");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/reports");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM dept_reports WHERE status = 'submitted' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS submitted,
      (SELECT COUNT(*)::int FROM dept_reports WHERE status = 'draft' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS drafts,
      (SELECT COUNT(DISTINCT department_id)::int FROM dept_reports WHERE status = 'submitted' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS depts
  `;

  const reports = await sql`
    SELECT r.*, d.name AS department_name, p.name AS submitted_by_name
    FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    LEFT JOIN profiles p ON p.user_id = r.submitted_by
    WHERE r.status = 'submitted'
      AND (r.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY r.month DESC, d.name ASC
    LIMIT 100
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Reports / ${stats?.submitted ?? 0} submitted / ${stats?.drafts ?? 0} drafts`}
          title="Department reports"
          lede="Submitted monthly documents — coverage, submissions, and growth. Draft until a Head submits; then immutable."
          meta={`${stats?.depts ?? 0} reporting departments / ${reports.length} submitted on file / newest first`}
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
              ← Back to overview
            </Link>
          }
        />

        <WorkspaceSection index="01" title="Export" note="Draft → submitted → exported. Exports include submitted reports only." action={<span className="aled-meta">JSON</span>}>
          <div className="aled-panel" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
            <span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <Download size={12} style={{ color: "var(--accent)" }} aria-hidden="true" /> Export submitted reports
            </span>
            <span className="aled-actions" style={{ marginLeft: "auto" }}>
              <a href="/api/reports/export?scope=semester" className="btn-ink inline-flex items-center gap-1.5 !py-1.5 text-xs">
                <Download size={12} aria-hidden="true" /> Semester
              </a>
              <a href="/api/reports/export?scope=annual" className="aled-tag aled-tag--accent" style={{ padding: "0.4rem 0.6rem" }}>
                <Download size={12} aria-hidden="true" /> Annual
              </a>
            </span>
          </div>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Submitted reports" note="Each row shows the department, month, and the headline numbers recorded at submission." action={<span className="aled-meta">{reports.length} shown · cap 100</span>}>
          {reports.length === 0 ? (
            <WorkspaceEmpty title="No submitted reports yet" body="Once department Heads submit from the lead console, they appear here ready to export." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {reports.map((r) => (
                <li key={r.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title">
                      {r.department_name} · {new Date(`${r.month}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
                    </span>
                    <p className="aled-sub">
                      {r.draft?.contributions_total ?? 0} contributions · {r.draft?.events_held ?? 0} events · {r.draft?.new_members ?? 0} new members
                      {r.submitted_by_name ? ` · by ${r.submitted_by_name}` : ""}
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
      </main>
    </AppShell>
  );
}
