import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { ContestForm } from "@/components/admin-forms";

export default async function AdminContestsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/contests");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/contests");
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT c.*, (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations, (SELECT COUNT(*)::int FROM contest_submissions s WHERE s.contest_id = c.id) AS submissions FROM contests c WHERE c.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL ORDER BY c.created_at DESC LIMIT 50`;
  const subs = await sql`
    SELECT s.*, c.title AS contest_title, p.name AS student_name FROM contest_submissions s
    JOIN contests c ON c.id = s.contest_id
    LEFT JOIN profiles p ON p.user_id = s.student_id
    WHERE c.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL
    ORDER BY s.created_at DESC LIMIT 20
  `;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Compete" title="Contests" desc="Create contests, publish them, and track registrations." />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            {rows.map((c) => (
              <div key={c.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{c.title}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{c.status} · {c.registrations} registrations · {c.submissions} submissions · {c.starts_at ? new Date(c.starts_at).toLocaleString("en-IN") : "no start"}</p>
              </div>
            ))}
            {rows.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No contests yet.</p>}
          </div>
          <ContestForm />
        </div>

        <section className="mt-10" aria-label="Submissions inbox">
          <div className="flex items-baseline justify-between">
            <p className="meta">Submissions inbox · {subs.length} latest</p>
          </div>
          {subs.length === 0 ? (
            <p className="narrative mt-3">No submissions yet. When students submit work, it lands here with their note and link — this used to be invisible.</p>
          ) : (
            <div className="mt-4 border-y" style={{ borderColor: "var(--line)" }}>
              <table className="dtable">
                <caption className="sr-only">Recent contest submissions</caption>
                <thead>
                  <tr><th scope="col">Student</th><th scope="col">Contest</th><th scope="col">Submission</th><th scope="col" style={{ textAlign: "right" }}>When</th></tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.student_name || s.student_id}</td>
                      <td>{s.contest_title}</td>
                      <td>
                        {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline" style={{ color: "var(--accent)" }}>{String(s.url).slice(0, 48)} ↗</a> : <span style={{ color: "var(--text-muted)" }}>no link</span>}
                        {s.note && <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{s.note}</span>}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>{new Date(s.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
