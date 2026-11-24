import { WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { UsageRouteBars, TourStepBars } from "@/components/admin/AnalyticsCharts";
import { AREA_LABELS, formatCount } from "@/lib/usage";

/**
 * The usage report, shared by `/admin/analytics` and `/lead/analytics`.
 *
 * Server component: the two charts are the only client leaves. Everything here
 * is read straight from `usage_daily` / `tour_daily`, which the nightly rollup
 * writes, so the page cost does not grow with traffic.
 *
 * Copy rules: every percentage names its denominator, and the visitor caveat is
 * printed rather than left for the reader to discover. The telemetry has no
 * identities, so the report never ranks people - only routes and steps.
 */

function StatRow({ stats }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text)" }}>{stat.value}</p>
          <p className="meta">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

function RouteTable({ rows, empty }) {
  if (!rows.length) return <p className="meta mt-3">{empty}</p>;
  return (
    <ul className="mt-3" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rows.map((row) => (
        <li
          key={`${row.area}:${row.path}`}
          className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2.5 first:border-t"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{row.path}</p>
            <p className="meta">{AREA_LABELS[row.area] || row.area} / {formatCount(row.views)} views / {row.signedInShare}% signed in</p>
          </div>
          <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>{row.share}%</span>
        </li>
      ))}
    </ul>
  );
}

export function UsageReport({ report, index = "05" }) {
  if (!report || report.empty) {
    return (
      <WorkspaceSection index={index} title="Journey" note={`Routes people actually open, last ${report?.windowDays ?? 30} days.`}>
        <WorkspaceEmpty
          title="No page views recorded yet"
          body="The tracker writes one page view per route and the nightly usage rollup turns them into this table. Both have to run before there is anything to read."
        />
      </WorkspaceSection>
    );
  }

  const { routes, tours, unreachable, totals: chapter, windowDays } = report;
  const totals = routes.totals;
  const tour = tours[0] || null;

  return (
    <>
      <WorkspaceSection
        index={index}
        title="Journey"
        note={`Routes people actually open, last ${windowDays} days. Views and signed-in shares aggregate; the audience figure is the chapter-wide daily unique, averaged over days with traffic.`}
      >
        <StatRow
          stats={[
            { value: formatCount(totals.views), label: "page views" },
            { value: formatCount(chapter.averageVisitors), label: "visitors / active day" },
            { value: `${totals.signedInShare}%`, label: "signed in" },
            { value: formatCount(totals.routes), label: "routes seen" }
          ]}
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="min-w-0">
            <UsageRouteBars data={routes.most.map((row) => ({ name: row.path.replace(/^\/(student|lead|admin)\//, ""), views: row.views }))} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Least visited</h3>
            <RouteTable rows={routes.least} empty="Only one route has traffic so far." />
          </div>
        </div>
        <p className="meta mt-3">
          Visitors on a route stay per route on purpose: summing them would count one person once per screen. The audience figure is different - it is counted once per day from the raw rows, then averaged, so a member active on three days is three visitor-days, not three people. Raw rows age out after 180 days; every number here comes from the nightly rollup.
        </p>
      </WorkspaceSection>

      <WorkspaceSection
        index={String(Number(index) + 1).padStart(2, "0")}
        title="Tour funnel"
        note="Where new members stop in the student tour. Starts, finishes and skips, per tour version."
      >
        {!tour || tour.started === 0 ? (
          <WorkspaceEmpty
            title="No tour runs yet"
            body="The tour opens once per member on their first Home visit. Starts, step reach and finishes appear here after the nightly rollup."
          />
        ) : (
          <>
            <StatRow
              stats={[
                { value: formatCount(tour.started), label: "starts" },
                { value: `${tour.completionRate}%`, label: "finished" },
                { value: `${tour.skipRate}%`, label: "skipped" },
                { value: `v${tour.version}`, label: "tour version" }
              ]}
            />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <TourStepBars data={tour.steps.map((step) => ({ name: `Step ${step.step}`, share: step.shareOfStart }))} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Step detail</h3>
                <ul className="mt-3" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {tour.steps.map((step) => (
                    <li
                      key={step.step}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2.5 first:border-t"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Step {step.step}{step.id ? ` / ${step.id}` : ""}</p>
                        <p className="meta">{formatCount(step.reached)} reached / {step.shareOfStart}% of starts</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>{step.shareOfStart}%</span>
                    </li>
                  ))}
                </ul>
                {tour.biggestDrop ? (
                  <p className="meta mt-3">
                    Biggest loss: {tour.biggestDrop.dropPct}% between step {tour.biggestDrop.from} and step {tour.biggestDrop.to}. Events are dropped by ad-blockers and closed tabs, so a small gap is normal.
                  </p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        index={String(Number(index) + 2).padStart(2, "0")}
        title="Hard to reach"
        note="Destinations the shell advertises that draw under 5% of the busiest screen in the same workspace."
      >
        {unreachable.length === 0 ? (
          <WorkspaceEmpty
            title="Every advertised destination is being found"
            body="No nav slot is below the 5% threshold in this window. As traffic grows, recheck this before assuming a route is fine."
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {unreachable.map((slot) => (
              <li
                key={slot.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2.5 first:border-t"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{slot.label}</p>
                  <p className="meta">{slot.path} / {AREA_LABELS[slot.area] || slot.area} / {formatCount(slot.views)} views vs {formatCount(slot.topViews)} for the busiest screen</p>
                </div>
                <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--warn)" }}>{slot.shareOfTop}%</span>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>
    </>
  );
}
