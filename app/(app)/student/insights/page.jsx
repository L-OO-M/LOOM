import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { InsightCards } from "@/components/loom/InsightCards";
import { ProveTabs } from "@/components/student/SectionRails";
import { studentInsights } from "@/lib/insights";
import { loadStudentInsightMetrics } from "@/lib/insights-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Insights",
  robots: { index: false, follow: false }
};

function dayLabel(value) {
  if (!value) return "";
  const date = value instanceof Date
    ? value
    : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * The member's own reading.
 *
 * This page used to redirect to `#growth` on the dashboard because the only
 * insight-like numbers were three stats in a rail. It is a real page now: the
 * cards come from `lib/insights.js` over rows the member can open, and the
 * evidence section names every source. A member with no recorded activity gets
 * an empty state, not a participation trophy.
 */
export default async function InsightsPage() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/student/insights");
  if (ctx.error) redirect("/student");
  const { user, profile, tenant, sql } = ctx;

  const metrics = await loadStudentInsightMetrics(sql, {
    userId: user.id,
    tenantId: tenant.id,
    profile
  });
  const insights = studentInsights(metrics);
  const trend = metrics.trend || [];
  const peak = trend.reduce((max, row) => Math.max(max, Number(row.consistency_score) || 0), 0);

  // A stat is shown only when its denominator exists. "0% of no track chosen"
  // is not a reading, it is a rounding of nothing.
  const stats = [];
  if (metrics.nodesTotal > 0) {
    stats.push({ value: metrics.roadmapPct, unit: "%", label: "verified on your track" });
    stats.push({ value: metrics.verifiedNodes, label: "verified nodes" });
  }
  if (metrics.consistency !== null) {
    stats.push({ value: metrics.consistency, unit: "%", label: "30-day consistency" });
  }
  stats.push({ value: metrics.openWork, label: "open pieces of work" });

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker="Insights / Your own rows"
          title="What your numbers say."
          lede="Read back from the same records the rest of the chapter sees: roadmap ticks, verified work, attendance, and the nightly activity rollup. Nothing here is predicted."
          meta={metrics.snapshot
            ? `Latest rollup ${dayLabel(metrics.snapshot.snapshot_date)} / ${trend.length} days of trend`
            : "No nightly rollup yet — counts are live rows"}
          stats={stats}
        />

        <ProveTabs active="/student/insights" />

        <WorkspaceSection
          index="01"
          title="The read"
          note="Ranked by what needs a person first. Every card links to the page its number came from."
        >
          {insights.length > 0 ? (
            <InsightCards insights={insights} />
          ) : (
            <WorkspaceEmpty
              title="Not enough recorded activity yet"
              body="Insights are built from real rows. Finish a roadmap node, submit one piece of work, or connect GitHub — then this page has something honest to say."
              action={
                <Link href="/student/roadmap" prefetch={false} className="btn-ink">
                  Open the roadmap
                </Link>
              }
            />
          )}
        </WorkspaceSection>

        <WorkspaceSection
          index="02"
          title="The last 14 days"
          note="One bar per recorded day, from the nightly snapshot. Height is consistency, not effort."
        >
          {trend.length > 0 ? (
            <div>
              <div
                role="img"
                aria-label={`Consistency over the last ${trend.length} recorded days, peaking at ${peak}%`}
                className="flex items-end gap-1 rounded-2xl border p-4"
                style={{ height: 120, borderColor: "var(--line)", background: "var(--bg-elevated)" }}
              >
                {trend.map((row) => {
                  const value = Math.max(0, Math.min(100, Number(row.consistency_score) || 0));
                  return (
                    <div
                      key={row.day}
                      title={`${dayLabel(row.day)}: ${value}% consistency`}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${Math.max(3, value)}%`,
                        background: "var(--accent)",
                        opacity: value > 0 ? 0.85 : 0.2
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
                <span>{dayLabel(trend[0]?.day)}</span>
                <span>{metrics.lastActive ? `Last recorded activity ${dayLabel(metrics.lastActive)}` : "No activity recorded"}</span>
                <span>{dayLabel(trend[trend.length - 1]?.day)}</span>
              </div>
            </div>
          ) : (
            <WorkspaceEmpty
              title="No snapshot history yet"
              body="The rollup runs nightly. Until it has run for you, the cards above use live counts — there is no line to draw yet."
            />
          )}
        </WorkspaceSection>

        <WorkspaceSection
          index="03"
          title="Where this comes from"
          note="The source of every claim, so you can check the reading instead of trusting it."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              { href: "/student/roadmap", label: "Roadmap progress", body: "Completed nodes, and which ones a lead has verified." },
              { href: "/student/work", label: "Department and event work", body: "Overdue, blocked, and submissions waiting on review." },
              { href: "/student/practice", label: "This week's practice", body: "The open set and how many problems you have solved." },
              { href: "/student/events", label: "Event attendance", body: "Registrations and whether you actually turned up." },
              { href: "/student/mentorship", label: "Mentoring", body: "Completed sessions where you were the mentor." },
              { href: "/student/leaderboard", label: "Standings", body: "The chapter ranking your consistency is compared against." }
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={false}
                  className="row-link flex items-start gap-3 rounded-xl border p-3"
                  style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{item.label}</span>
                    <span className="block text-xs leading-5" style={{ color: "var(--text-muted)" }}>{item.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
