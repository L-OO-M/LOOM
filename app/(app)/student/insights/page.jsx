import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

function Bars({ trend }) {
  if (!trend.length) return null;
  const max = Math.max(1, ...trend.map((t) => t.total_commits + t.total_prs + t.total_reviews));
  return (
    <div className="mt-4 flex h-28 items-end gap-1.5" role="img" aria-label="14-day activity">
      {trend.map((t) => {
        const v = t.total_commits + t.total_prs + t.total_reviews;
        return (
          <div key={t.snapshot_date} className="flex-1 rounded-t" title={`${t.snapshot_date}: ${v} actions`}
            style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: v > 0 ? "var(--accent)" : "var(--line)", opacity: v > 0 ? 0.85 : 0.5 }} />
        );
      })}
    </div>
  );
}

export default async function InsightsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/insights");
  const { user, profile, tenant, sql } = ctx;

  const [latest] = await sql`
    SELECT * FROM student_analytics_snapshots WHERE student_id = ${user.id}
    ORDER BY snapshot_date DESC LIMIT 1
  `;
  const trend = await sql`
    SELECT snapshot_date, total_commits, total_prs, total_reviews FROM student_analytics_snapshots
    WHERE student_id = ${user.id} ORDER BY snapshot_date DESC LIMIT 14
  `;
  const [peers] = await sql`
    SELECT COALESCE(AVG(consistency_score),0)::numeric AS ac, COALESCE(AVG(roadmap_completion_pct),0)::numeric AS ar,
           COUNT(*)::int AS n
    FROM student_analytics_snapshots
    WHERE tenant_id = ${tenant?.id ?? null}::uuid AND snapshot_date = CURRENT_DATE AND student_id <> ${user.id}
  `;
  const [rank] = await sql`
    SELECT COUNT(*)::int + 1 AS rank FROM student_analytics_snapshots
    WHERE tenant_id = ${tenant?.id ?? null}::uuid AND snapshot_date = CURRENT_DATE
      AND roadmap_completion_pct > ${latest?.roadmap_completion_pct ?? 0}
  `;

  if (!latest) {
    return (
      <AppShell area="student" tenant={tenant} user={user}>
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <PageHeader kicker="Insights" title="Your growth, quantified" desc="Snapshots refresh nightly." />
          <EmptyState title="No snapshot yet" body="Nightly rollups start after your first activity. Connect GitHub and complete a roadmap node." action={<Link href="/student/github" className="btn-ink">Connect GitHub</Link>} />
        </main>
      </AppShell>
    );
  }

  const domain = profile?.primary_domain || "web";
  const done = Number(latest.roadmap_completion_pct || 0);
  const rec = done < 30
    ? { title: "Finish your foundations", body: `You are ${done}% through the roadmap. Complete the next node before branching out.`, link: "/student/roadmap" }
    : (latest.oss_verified || 0) === 0
      ? { title: "Ship your first open-source PR", body: `Strong progress (${done}%). Convert it into public proof.`, link: "/student/opensource" }
      : { title: `Go deeper in ${domain}`, body: "Momentum plus proof. Take the advanced track — and mentor someone behind you.", link: "/student/resources" };

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Insights" title="Your growth, quantified" desc={`Chapter rank #${rank?.rank || 1} by roadmap completion · snapshots refresh nightly.`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Consistency (30d)" value={`${Number(latest.consistency_score || 0)}%`} />
          <Stat label="Roadmap" value={`${done}%`} />
          <Stat label="Commits (30d)" value={latest.total_commits} />
          <Stat label="Verified OSS" value={latest.oss_verified} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Activity — last 14 snapshots</h2>
            <Bars trend={[...trend].reverse()} />
            <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>{latest.active_days_30} active days in the last 30.</p>
          </Card>
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Peers — anonymous chapter average</h2>
            <div className="mt-3 space-y-3 text-sm">
              {[
                ["Consistency", Number(latest.consistency_score || 0), Number(peers?.ac || 0), "%"],
                ["Roadmap", done, Number(peers?.ar || 0), "%"]
              ].map(([label, me, avg, unit]) => (
                <div key={label}>
                  <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{label}</span><span>you {me}{unit} · avg {avg}{unit}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, me)}%`, background: "var(--accent)" }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Compared against {peers?.n || 0} chapter peers (today).</p>
          </Card>
        </div>

        <Card className="mt-6">
          <p className="kicker">Recommended next</p>
          <h2 className="mt-2 font-medium" style={{ color: "var(--text)" }}>{rec.title}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{rec.body}</p>
          <Link href={rec.link} className="btn-ink mt-4 inline-block">Continue →</Link>
        </Card>
      </main>
    </AppShell>
  );
}
