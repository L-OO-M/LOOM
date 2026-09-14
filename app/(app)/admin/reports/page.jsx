import Link from "next/link";
import { redirect } from "next/navigation";
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
  const drafts = await sql`
    SELECT COUNT(*)::int AS c FROM dept_reports
    WHERE status = 'draft' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Operations" title="Department reports" desc="Submitted monthly reports, ready to export for the semester or the year." />
        <p className="meta mt-2"><Link href="/admin" prefetch={false} className="hover:underline">← Back to admin</Link></p>

        <section className="mt-8 flex flex-wrap items-center gap-3" aria-label="Export">
          <Meta>Export compiled JSON</Meta>
          <span className="flex gap-2">
            <a href="/api/reports/export?scope=semester" className="btn-ink !py-1.5 !text-xs">Download semester</a>
            <a href="/api/reports/export?scope=annual" className="btn-ghost !py-1.5 !text-xs">Download annual</a>
          </span>
          {(drafts[0]?.c ?? 0) > 0 && (
            <span className="meta">{drafts[0].c} draft{drafts[0].c === 1 ? "" : "s"} still unsubmitted — exports include submitted reports only.</span>
          )}
        </section>

        <section className="mt-8" aria-label="Submitted reports">
          <Meta>{reports.length} submitted report{reports.length === 1 ? "" : "s"}</Meta>
          {reports.length === 0 ? (
            <p className="narrative mt-3">No submitted reports yet. Once department Heads compile and submit their monthly reports from the lead console, they appear here.</p>
          ) : (
            <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-3 p-4">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {r.department_name} · {new Date(`${r.month}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
                    </span>
                    <span className="meta">
                      {r.draft?.contributions_total ?? 0} contributions · {r.draft?.events_held ?? 0} events held · {r.draft?.new_members ?? 0} new members
                      {r.submitted_by_name ? ` · submitted by ${r.submitted_by_name}` : ""}
                    </span>
                  </span>
                  <span className="meta shrink-0">submitted</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
