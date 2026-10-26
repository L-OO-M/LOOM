import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { DomainBars, ActivityLine, BottleneckBars } from "@/components/admin/AnalyticsCharts";
import "../_components/admin-ledger.css";

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

  const snapshot = health ? new Date(health.cohort_date).toLocaleDateString("en-IN") : "no snapshot yet";

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Data / ${snapshot} / rolled up nightly`}
          title="Chapter analytics"
          lede="Cohort health, bottlenecks, mentors, and contests — real nightly rollups, not live aggregates."
          meta={`${history.length} days of history / ${bottlenecks.length} nodes with funnel data`}
          tone="ledger"
          art="/domains-art/domain-web.png"
          artAlt=""
          stats={[
            { value: health?.total_students ?? 0, label: "students in cohort" },
            { value: health?.active_students_7d ?? 0, label: "active in 7 days" },
            { value: Number(health?.avg_consistency || 0), unit: "%", label: "avg consistency" },
            { value: Number(health?.avg_roadmap_pct || 0), unit: "%", label: "avg roadmap" }
          ]}
        />

        <WorkspaceSection index="01" title="Distribution & activity" note="Domain membership and the last 30 days of engagement, straight from cohort snapshots.">
          <div className="adminx-chart-grid">
            <div className="adminx-chart"><DomainBars data={domainData} /></div>
            <div className="adminx-chart"><ActivityLine data={activityData} /></div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Funnel bottlenecks" note="Nodes ranked by drop-off — hue marks the danger threshold above 50%.">
          <div className="adminx-chart"><BottleneckBars data={bottleneckData} /></div>
        </WorkspaceSection>

        <WorkspaceSection index="03" title="Detail ledger" note="The rows behind the charts: funnel loss, mentor load, and contest conversion.">
          <div className="aled-cols-3">
            <div>
              <h3 className="aled-panel-title">Bottleneck details</h3>
              {bottlenecks.length === 0 ? (
                <WorkspaceEmpty title="No funnel data yet" body="Nodes appear once students start them." />
              ) : (
                <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
                  {bottlenecks.map((b) => (
                    <li key={b.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                      <div className="aled-copy">
                        <span className="aled-title">{b.title || b.node_id}</span>
                        <p className="aled-sub">{b.total_completed} of {b.total_started} complete</p>
                      </div>
                      <span className={`aled-value${Number(b.drop_off_pct) > 50 ? " is-danger" : ""}`}>{b.drop_off_pct}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="aled-panel-title">Mentor effectiveness</h3>
              {mentors.length === 0 ? (
                <WorkspaceEmpty title="No mentor sessions yet" body="Mentors appear once they have logged a session." />
              ) : (
                <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
                  {mentors.map((m) => (
                    <li key={m.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                      <div className="aled-copy">
                        <span className="aled-title">{m.mentor_name || m.mentor_id}</span>
                        <p className="aled-sub">{m.mentees || m.mentee_count} mentees / {m.session_count} sessions</p>
                      </div>
                      <span className="aled-value">{Number(m.avg_mentee_roadmap_pct || 0)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="aled-panel-title">Contest insights</h3>
              {contests.length === 0 ? (
                <WorkspaceEmpty title="No contests yet" body="Contest registration and submission totals appear here." />
              ) : (
                <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
                  {contests.map((c, i) => (
                    <li key={i} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                      <div className="aled-copy">
                        <span className="aled-title">{c.title}</span>
                        <p className="aled-sub">{c.regs} registered / {c.subs} submitted{c.regs > 0 ? ` / ${Math.round((c.subs / c.regs) * 100)}% submit rate` : ""}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
