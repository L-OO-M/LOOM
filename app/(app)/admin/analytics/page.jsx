import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { BarChart3, Users, TrendingUp, GraduationCap } from "lucide-react";
import { PageHeader, Card } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { DomainBars, ActivityLine, BottleneckBars } from "@/components/admin/AnalyticsCharts";

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
    WHERE tenant_id = ${tenant?.id ?? null}::uuid ORDER BY cohort_date DESC LIMIT 30
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
  const domainData = Object.entries(dist).map(([name, value]) => ({ name, value: Number(value) })).sort((a, b) => b.value - a.value);
  const activityData = [...history].reverse().map((h) => ({
    label: new Date(h.cohort_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    active: Number(h.active_students_7d ?? 0),
    consistency: Number(h.avg_consistency ?? 0),
  }));
  const bottleneckData = bottlenecks.map((b) => ({
    name: (b.title || b.node_id || "node").slice(0, 22),
    drop: Number(b.drop_off_pct ?? 0),
    started: b.total_started,
    completed: b.total_completed,
  }));

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Data · ${health ? new Date(health.cohort_date).toLocaleDateString("en-IN") : "no snapshot yet"} · rolled up nightly`} title="Chapter analytics" desc="Cohort health, bottlenecks, mentors, and contests — real rollups, not live aggregates." />
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Students", value: health?.total_students ?? 0, icon: Users, sub: "cohort" },
            { label: "Active 7d", value: health?.active_students_7d ?? 0, icon: TrendingUp, sub: "weekly" },
            { label: "Consistency", value: `${Number(health?.avg_consistency || 0)}%`, icon: BarChart3, sub: "avg" },
            { label: "Roadmap", value: `${Number(health?.avg_roadmap_pct || 0)}%`, icon: GraduationCap, sub: "avg" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <DomainBars data={domainData} />
          <ActivityLine data={activityData} />
        </div>

        <div className="mt-6">
          <BottleneckBars data={bottleneckData} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Bottleneck details</h2>
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
