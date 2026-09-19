import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Download, Clock3, Building2 } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";

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
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Reports · ${stats?.submitted ?? 0} submitted · ${stats?.drafts ?? 0} drafts`} title="Department reports" desc="Submitted monthly reports — the ledger of what each department shipped, held, and grew." />
        <p className="meta -mt-6 mb-6"><Link href="/admin" prefetch={false} className="hover:underline" style={{ color: "var(--accent)" }}>← Back to overview</Link></p>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Submitted", value: stats?.submitted ?? 0, icon: FileText, sub: "this chapter" },
            { label: "Drafts", value: stats?.drafts ?? 0, icon: Clock3, sub: "unsubmitted" },
            { label: "Departments", value: stats?.depts ?? 0, icon: Building2, sub: "reporting" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <section className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Export">
          <div className="flex items-center gap-2">
            <Download size={14} style={{ color: "var(--accent)" }} />
            <Meta>Export compiled JSON · submitted only</Meta>
          </div>
          <span className="flex gap-2">
            <a href="/api/reports/export?scope=semester" className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold" style={{ background: "var(--text)", color: "var(--bg)" }}><Download size={12} /> Semester</a>
            <a href="/api/reports/export?scope=annual" className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", color: "var(--text)" }}><Download size={12} /> Annual</a>
          </span>
          {(stats?.drafts ?? 0) > 0 && <span className="meta">{stats.drafts} draft{stats.drafts === 1 ? "" : "s"} still unsubmitted — exports include submitted only.</span>}
        </section>

        <section className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Submitted reports">
          <div className="flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><FileText size={14} /> Submitted · {reports.length}</h2>
            <span className="meta">newest first · cap 100</span>
          </div>
          {reports.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="narrative">No submitted reports yet. Once department Heads submit from the lead console, they appear here ready to export.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {r.department_name} · {new Date(`${r.month}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
                    </span>
                    <span className="meta flex flex-wrap gap-2">
                      <span>{r.draft?.contributions_total ?? 0} contributions</span>
                      <span>· {r.draft?.events_held ?? 0} events</span>
                      <span>· {r.draft?.new_members ?? 0} new members</span>
                      {r.submitted_by_name && <span>· by {r.submitted_by_name}</span>}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "color-mix(in srgb, #16a34a 18%, transparent)", background: "color-mix(in srgb, #16a34a 10%, var(--bg))", color: "#16a34a" }}>Submitted</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
