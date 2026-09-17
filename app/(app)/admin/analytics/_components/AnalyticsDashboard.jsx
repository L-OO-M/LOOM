"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { compact } from "@/lib/analytics";
import { SegControl } from "@/components/loom/primitives";
import { OnboardingState, ErrorState } from "@/components/loom/States";
import { SaasSidebar } from "./SaasSidebar";
import { DashHeader } from "./DashHeader";
import { KpiCards } from "./KpiCards";
import { TrendChart, ChartSkeleton } from "./TrendChart";
import { TopLists, SelectionDetail } from "./TopLists";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "behavior", label: "User Behavior" },
  { id: "performance", label: "Performance" },
];

const PERIOD_OPTS = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function AnalyticsDashboard({ initial, user }) {
  const router = useRouter();
  const [period, setPeriod] = useState(initial?.period || "monthly");
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/summary?period=${p}`);
      const body = await res.json();
      if (!body.ok) throw new Error(body.error?.message || "Unable to load analytics");
      setData(body.data);
    } catch (e) {
      setError(e.message || "Unable to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  // Centralized period state: one fetch feeds KPIs, chart, and every list.
  useEffect(() => {
    if (period !== initial?.period) load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const empty = useMemo(() => {
    if (!data || loading) return false;
    const kpiZero = (data.kpis || []).every((k) => Number(k.value) === 0);
    const seriesZero = (data.series || []).every((s) => !s.visitors && !s.pageViews);
    return kpiZero && seriesZero;
  }, [data, loading]);

  const onPickResult = (r) => {
    setSearchQuery("");
    router.push(r.href);
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredTops = useMemo(() => {
    if (!data?.traffic || !q) return data?.traffic;
    const match = (s) => (s || "").toLowerCase().includes(q);
    return {
      referrers: data.traffic.referrers.filter((r) => match(r.label)),
      pages: data.traffic.pages.filter((p) => match(p.label)),
      sources: data.traffic.sources.filter((s) => match(s.label)),
    };
  }, [data, q]);

  const tabLabel = TABS.find((t) => t.id === tab)?.label || "Overview";

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5">
      <SaasSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="min-w-0 flex-1">
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
          <DashHeader
            user={user}
            tabLabel={tabLabel}
            onOpenMobile={() => setMobileOpen(true)}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onPickResult={onPickResult}
          />

          <main className="px-4 py-5 sm:px-5">
            {/* Analytics tabs — real content switching, scrollable on mobile */}
            <div className="flex items-center gap-5 overflow-x-auto border-b" style={{ borderColor: "var(--line)" }} role="tablist" aria-label="Analytics views">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className="shrink-0 pb-2.5 text-[13.5px] font-medium transition"
                  style={{
                    color: tab === t.id ? "var(--text)" : "var(--text-muted)",
                    borderBottom: tab === t.id ? "2px solid var(--dash-accent)" : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {error ? (
              <ErrorState
                title="Unable to load analytics"
                body={error}
                onRetry={() => load(period)}
              />
            ) : empty ? (
              <OnboardingState
                eyebrow="Analytics"
                title="No analytics data available"
                why="Tracking just started on this site — every visit is recorded first-party from here on. Browse a few pages and this dashboard fills with real unique visitors and page views."
                action={<Link href="/admin/students" prefetch={false} className="btn-ink">View roster</Link>}
              />
            ) : (
              <div className="mt-4 space-y-4">
                {tab === "overview" && (
                  <>
                    <KpiCards kpis={data?.kpis || []} period={data?.period || period} loading={loading || !data} />
                    <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Analysis">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Analysis</h2>
                          <p className="mt-0.5 max-w-xl text-[12px] leading-5" style={{ color: "var(--text-muted)" }}>
                            Analyze user engagement and improve your product with real-time analytics.
                          </p>
                        </div>
                        <SegControl options={PERIOD_OPTS} value={data?.period || period} onChange={setPeriod} label="Time period" />
                      </div>
                      <div className="mt-3">
                        {loading || !data ? <ChartSkeleton /> : (
                          <TrendChart
                            data={data.series}
                            seriesA="Unique Visitor"
                            seriesB="Page View"
                            keyA="visitors"
                            keyB="pageViews"
                            fill
                          />
                        )}
                      </div>
                    </section>
                    <SelectionDetail selected={selected} onClear={() => setSelected(null)} />
                    {filteredTops && <TopLists tops={filteredTops} selected={selected} onSelect={setSelected} />}
                    {q && filteredTops && Object.values(filteredTops).every((l) => l.length === 0) && (
                      <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                        No dashboard rows match “{searchQuery}”.
                      </p>
                    )}
                  </>
                )}
                {tab === "behavior" && (
                  <BehaviorPanel
                    behavior={data?.behavior}
                    loading={loading || !data}
                    selected={selected}
                    onSelect={setSelected}
                  />
                )}
                {tab === "performance" && (
                  <PerformancePanel performance={data?.performance} projects={data?.projects} loading={loading || !data} />
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function BehaviorPanel({ behavior, loading, selected, onSelect }) {
  const domainFilter = selected?.kind === "domain" ? selected.id : null;
  const resources = useMemo(() => {
    const list = behavior?.resources || [];
    return domainFilter ? list.filter((r) => r.domain === domainFilter) : list;
  }, [behavior, domainFilter]);
  if (loading) {
    return <div aria-hidden="true"><div className="skel" style={{ height: 180 }} /><div className="skel mt-3" style={{ height: 120 }} /></div>;
  }
  const days = behavior?.weekdays || [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Activity by weekday">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>When members show up</h2>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>Commits, PRs, and reviews by weekday — real activity, last 60 days.</p>
          {days.every((d) => d.value === 0) ? (
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>No activity recorded yet.</p>
          ) : (
            <div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label="Weekday activity bars">
              {days.map((d) => (
                <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-20 w-full items-end">
                    <div
                      className="w-full rounded-t-md"
                      title={`${d.label}: ${d.value}`}
                      style={{ height: `${Math.max(5, d.ratio * 100)}%`, background: "var(--dash-accent)", opacity: 0.55 + d.ratio * 0.45 }}
                    />
                  </div>
                  <span className="text-[10.5px] font-medium" style={{ color: "var(--text-muted)" }}>{d.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Consistency">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Consistency signal</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[24px] font-bold tabular-nums" style={{ color: "var(--text)" }}>{Number(behavior?.avgConsistency || 0).toFixed(0)}%</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Avg consistency score</p>
            </div>
            <div>
              <p className="text-[24px] font-bold tabular-nums" style={{ color: "var(--text)" }}>{compact(behavior?.active7d || 0)}</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Active in last 7 days</p>
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-5" style={{ color: "var(--text-muted)" }}>
            Steady weeks beat intense weekends. Nudge members whose streaks are about to break.
          </p>
        </section>
      </div>
      <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Top resources">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Resources members finish</h2>
          {domainFilter && (
            <button type="button" onClick={() => onSelect(null)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--dash-accent-soft)", color: "var(--dash-accent-strong)" }}>
              {domainFilter} <X size={11} aria-label="Clear domain filter" />
            </button>
          )}
        </div>
        {resources.length === 0 ? (
          <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {domainFilter ? `No finished resources in ${domainFilter} yet.` : "No resource completions yet."}
          </p>
        ) : (
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
            {resources.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "resource", id: r.id, label: r.title, ...r })}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-[var(--bg-muted)]"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: "var(--text)" }}>{r.title}</span>
                  <span className="shrink-0 text-[11px]" style={{ color: "var(--text-muted)" }}>{r.domain}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: "var(--text-muted)" }}>{compact(r.done)} done</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PerformancePanel({ performance, projects, loading }) {
  if (loading) {
    return <div aria-hidden="true"><div className="skel" style={{ height: 180 }} /><div className="skel mt-3" style={{ height: 120 }} /></div>;
  }
  const funnel = performance?.funnel || [];
  const maxDrop = Math.max(1, ...funnel.map((f) => Number(f.dropOff) || 0));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Roadmap funnel">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Where the path leaks</h2>
          {funnel.length === 0 ? (
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>No funnel data yet.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {funnel.slice(0, 6).map((f) => (
                <li key={f.id}>
                  <div className="flex justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate font-medium" style={{ color: "var(--text)" }}>{f.title}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: Number(f.dropOff) > 50 ? "var(--danger)" : "var(--text-muted)" }}>
                      {compact(f.completed)}/{compact(f.started)} · {Number(f.dropOff)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-muted)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(Number(f.dropOff) / maxDrop) * 100}%`, background: Number(f.dropOff) > 50 ? "var(--danger)" : "var(--dash-accent)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Proof output">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Proof output</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[24px] font-bold tabular-nums" style={{ color: "var(--text)" }}>{compact(performance?.ossVerified || 0)}</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Verified OSS merges</p>
            </div>
            <div>
              <p className="text-[24px] font-bold tabular-nums" style={{ color: "var(--text)" }}>{compact((projects || []).length)}</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Recent projects</p>
            </div>
          </div>
          {(projects || []).length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {(projects || []).map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/projects`} prefetch={false} className="block truncate text-[12.5px] transition hover:underline" style={{ color: "var(--text)" }}>
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Contest conversion">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Contest conversion</h2>
        {(performance?.contests || []).length === 0 ? (
          <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>No contests yet.</p>
        ) : (
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
            {(performance?.contests || []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-2 py-2 text-[12.5px]">
                <span className="min-w-0 truncate font-medium" style={{ color: "var(--text)" }}>{c.title}</span>
                <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {c.regs} reg · {c.subs} subs{c.regs > 0 ? ` · ${Math.round((c.subs / c.regs) * 100)}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
