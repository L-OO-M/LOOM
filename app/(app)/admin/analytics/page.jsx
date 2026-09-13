import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/analytics");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/analytics");
  const { tenant, user, sql } = ctx;

  const [health] = await sql`
    SELECT * FROM cohort_metrics WHERE tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY cohort_date DESC LIMIT 1
  `;
  const history = await sql`
    SELECT cohort_date, active_students_7d, avg_consistency FROM cohort_metrics
    WHERE tenant_id = ${tenant?.id ?? null}::uuid ORDER BY cohort_date DESC LIMIT 14
  `;
  const bottlenecks = await sql`
    SELECT n.*, r.title FROM roadmap_node_analytics n
    LEFT JOIN roadmap_nodes r ON r.id = n.node_id
    WHERE n.tenant_id = ${tenant?.id ?? null}::uuid AND n.total_started > 0
    ORDER BY n.drop_off_pct DESC LIMIT 8
  `;
  const mentors = await sql`
    SELECT e.*, p.name AS mentor_name FROM mentor_effectiveness e
    LEFT JOIN profiles p ON p.user_id = e.mentor_id
    WHERE e.tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY e.session_count DESC LIMIT 10
  `;
  const contests = await sql`
    SELECT k.title,
      (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = k.id) AS regs,
      (SELECT COUNT(*)::int FROM contest_submissions s WHERE s.contest_id = k.id) AS subs
    FROM contests k ORDER BY k.created_at DESC NULLS LAST LIMIT 8
  `;
  const dist = health?.domain_distribution || {};
  const distMax = Math.max(1, ...Object.values(dist).map(Number));

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Admin · Data" title="Chapter analytics" desc="Cohort health, bottlenecks, mentors, and contests — rolled up nightly." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Students" value={health?.total_students ?? 0} />
          <Stat label="Active (7d)" value={health?.active_students_7d ?? 0} />
          <Stat label="Avg consistency" value={`${Number(health?.avg_consistency || 0)}%`} />
          <Stat label="Avg roadmap" value={`${Number(health?.avg_roadmap_pct || 0)}%`} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Domain distribution</h2>
            {Object.keys(dist).length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No data yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {Object.entries(dist).map(([d, n]) => (
                  <li key={d}>
                    <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                      <span className="capitalize">{d}</span><span>{n}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(Number(n) / distMax) * 100}%`, background: "var(--accent)" }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="mt-6 font-medium" style={{ color: "var(--text)" }}>Activity — last {history.length} days</h2>
            <div className="mt-3 flex h-20 items-end gap-1.5">
              {[...history].reverse().map((h) => {
                const max = Math.max(1, ...history.map((x) => x.active_students_7d));
                return <div key={h.cohort_date} title={`${h.cohort_date}: ${h.active_students_7d} active`} className="flex-1 rounded-t" style={{ height: `${Math.max(6, (h.active_students_7d / max) * 100)}%`, background: "var(--accent)", opacity: 0.85 }} />;
              })}
            </div>
          </Card>

          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Bottleneck nodes — highest drop-off</h2>
            {bottlenecks.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No funnel data yet. Nodes appear once students start them.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {bottlenecks.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate" style={{ color: "var(--text)" }}>{b.title || b.node_id} <span style={{ color: "var(--text-muted)" }}>· {b.total_completed}/{b.total_started}</span></span>
                    <span className="shrink-0 font-mono" style={{ color: Number(b.drop_off_pct) > 50 ? "var(--danger)" : "var(--text-muted)" }}>{b.drop_off_pct}% drop</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Mentor effectiveness</h2>
            {mentors.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No mentors with sessions yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {mentors.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span style={{ color: "var(--text)" }}>{m.mentor_name || m.mentor_id}</span>
                    <span style={{ color: "var(--text-muted)" }}>{m.mentees || m.mentee_count} mentees · {m.session_count} sessions · {Number(m.avg_mentee_roadmap_pct || 0)}% avg</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Contest insights</h2>
            {contests.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No contests yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {contests.map((c, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate" style={{ color: "var(--text)" }}>{c.title}</span>
                    <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{c.regs} reg · {c.subs} subs{c.regs > 0 ? ` · ${Math.round((c.subs / c.regs) * 100)}% submit` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
