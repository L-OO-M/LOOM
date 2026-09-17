"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ChartNoAxesCombined, Handshake, Users, CalendarDays,
  Trophy, Flag, ScrollText, Settings, Menu, X,
} from "lucide-react";
import { Meta, SegControl } from "@/components/loom/primitives";
import { StatTile, TileGrid } from "@/components/loom/StatTiles";
import { ActivityStream } from "@/components/loom/Evidence";
import { TrendChart, ChartSkeleton } from "@/components/loom/TrendChart";

/* Admin overview as an operations console with its own left rail:
   Analytics (users-over-time graph) and Mentoring live on this page,
   so both are one click/scroll away instead of separate destinations.
   Every number below is computed live — never a vanity metric. */

const ON_PAGE = [
  { id: "top", label: "Overview" },
  { id: "users", label: "Users over time" },
  { id: "mentoring", label: "Mentoring" },
  { id: "outcomes", label: "Outcomes" },
  { id: "attention", label: "Attention" },
  { id: "departments", label: "Departments" },
  { id: "upcoming", label: "Upcoming" },
  { id: "audit", label: "Audit trail" },
];

const MANAGE = [
  { label: "Analytics dashboard", icon: ChartNoAxesCombined, href: "/admin/analytics" },
  { label: "Mentors", icon: Handshake, href: "/admin/mentors" },
  { label: "Students", icon: Users, href: "/admin/students" },
  { label: "Contests", icon: Trophy, href: "/admin/contests" },
  { label: "Events", icon: CalendarDays, href: "/admin/events" },
  { label: "Community flags", icon: Flag, href: "/admin/community" },
  { label: "Reports", icon: ScrollText, href: "/admin/reports" },
  { label: "Settings", icon: Settings, href: "/admin/settings" },
];

const PERIOD_OPTS = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function scrollTo(id) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function RailBody({ active, onJump, onNavigate }) {
  return (
    <div className="flex-1 overflow-y-auto px-2.5 py-3" onClick={onNavigate}>
      <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
        Console
      </p>
      <div className="space-y-0.5">
        {ON_PAGE.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onJump(n.id)}
            aria-current={active === n.id ? "true" : undefined}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition"
            style={active === n.id
              ? { background: "var(--dash-accent-soft, var(--wash))", color: "var(--dash-accent-strong, var(--text))" }
              : { color: "var(--text-muted)" }}
          >
            <LayoutDashboard size={15} strokeWidth={active === n.id ? 2 : 1.6} className="shrink-0" />
            <span className="truncate">{n.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
          Manage
        </p>
        <div className="space-y-0.5">
          {MANAGE.map((n) => {
            const Icon = n.icon;
            return (
              <Link
                key={n.href + n.label}
                href={n.href}
                prefetch={false}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition hover:bg-[var(--bg-muted)]"
                style={{ color: "var(--text-muted)" }}
              >
                <Icon size={15} strokeWidth={1.6} className="shrink-0" />
                <span className="truncate">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard({ outcomes, attention, departments = [], upcoming, auditEntries, analyticsInitial, mentoring }) {
  const o = outcomes;
  const [active, setActive] = useState("top");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [period, setPeriod] = useState(analyticsInitial?.period || "monthly");
  const [series, setSeries] = useState(analyticsInitial?.series || null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [seriesError, setSeriesError] = useState(null);

  // Interactive period: one fetch repaints the users graph.
  useEffect(() => {
    if (period === analyticsInitial?.period) {
      setSeries(analyticsInitial?.series || null);
      return;
    }
    let live = true;
    setLoadingSeries(true);
    setSeriesError(null);
    fetch(`/api/analytics/summary?period=${period}`).then((r) => r.json()).then((d) => {
      if (!live) return;
      if (d?.ok) setSeries(d.data.series);
      else throw new Error(d.error?.message || "Couldn't load the graph");
      setLoadingSeries(false);
    }).catch((e) => {
      if (!live) return;
      setSeriesError(e.message);
      setLoadingSeries(false);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const jump = (id) => {
    setActive(id);
    setMobileOpen(false);
    scrollTo(id);
  };

  const seriesEmpty = series && series.every((s) => !s.visitors && !s.pageViews);
  const stats = mentoring?.stats;

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5">
      {/* Console navigation — on-demand drawer on all screens, so the page
          stays full-width. Same section jumps + manage links, nothing removed. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Admin console navigation">
          <div className="overlay" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="drawer !left-0 !right-auto flex flex-col border-l-0 border-r" style={{ borderColor: "var(--line)" }}>
            <div className="flex h-14 items-center justify-between border-b px-3" style={{ borderColor: "var(--line)" }}>
              <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>Console</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded-md p-1.5 hover:bg-[var(--bg-muted)]" style={{ color: "var(--text-muted)" }}>
                <X size={16} />
              </button>
            </div>
            <RailBody active={active} onJump={jump} />
          </aside>
        </div>
      )}

      <main id="top" className="animate-in min-w-0 flex-1 scroll-mt-24">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            title="Console navigation — sections and manage links"
            className="rounded-lg p-2 transition hover:bg-[var(--bg-muted)]"
            style={{ color: "var(--text-muted)" }}
          >
            <Menu size={17} />
          </button>
          <Meta>Operations · {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}</Meta>
        </div>
        <h1 className="h-product mt-3" style={{ fontSize: "1.8rem" }}>
          The chapter, at a glance.
        </h1>

        {/* Users-over-time graph — distinct active learners + completions. */}
        <section id="users" className="mt-8 scroll-mt-24 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Users over time">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Meta>Analytics · live from rollups</Meta>
              <h2 className="mt-1 text-[17px] font-semibold" style={{ color: "var(--text)" }}>Users over the month</h2>
              <p className="mt-0.5 max-w-xl text-[12.5px] leading-5" style={{ color: "var(--text-muted)" }}>
                Unique visitors and page views per month — measured first-party on this site.
              </p>
            </div>
            <SegControl options={PERIOD_OPTS} value={period} onChange={setPeriod} label="Graph period" />
          </div>
          <div className="mt-3">
            {loadingSeries ? (
              <ChartSkeleton />
            ) : seriesError ? (
              <div className="py-6 text-center">
                <p className="text-sm" style={{ color: "var(--danger)" }}>{seriesError}</p>
                <button type="button" onClick={() => setPeriod((p) => (p === "monthly" ? "daily" : "monthly"))} className="mt-2 text-[13px] font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  Try again
                </button>
              </div>
            ) : seriesEmpty ? (
              <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                No activity in this range yet — the graph draws itself once members learn and ship.
              </p>
            ) : (
              <TrendChart data={series} seriesA="Unique Visitor" seriesB="Page View" keyA="visitors" keyB="pageViews" fill />
            )}
          </div>
          <Link href="/admin/analytics" prefetch={false} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold hover:underline" style={{ color: "var(--dash-accent-strong, var(--accent))" }}>
            Open the full analytics dashboard →
          </Link>
        </section>

        {/* Mentoring snapshot — requests, stats, entry to mentor consoles. */}
        <section id="mentoring" className="mt-6 scroll-mt-24 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Mentoring">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Meta>Guidance · live requests</Meta>
              <h2 className="mt-1 text-[17px] font-semibold" style={{ color: "var(--text)" }}>Mentoring</h2>
            </div>
            <Link href="/admin/mentors" prefetch={false} className="text-[13px] font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              Manage mentors →
            </Link>
          </div>
          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Pending requests", stats.pending ?? 0],
                ["Scheduled", stats.upcoming ?? 0],
                ["Completed", stats.completed ?? 0],
                ["Avg rating", Number(stats.rating ?? 0).toFixed(1)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                  <p className="text-[20px] font-bold tabular-nums" style={{ color: "var(--text)" }}>{value}</p>
                  <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>{label}</p>
                </div>
              ))}
            </div>
          )}
          {(mentoring?.requests || []).length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>No session requests waiting. New bookings land here for review.</p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {(mentoring?.requests || []).map((s) => (
                <li key={s.id}>
                  <Link href="/admin/mentors" prefetch={false} className="row-link flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-2 py-2.5">
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {s.student_name || "Student"} → {s.mentor_name || "Mentor"}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {s.scheduled_at ? new Date(s.scheduled_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "open request"}
                      {s.topic ? ` · ${s.topic}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div id="outcomes" className="mt-10 grid scroll-mt-24 gap-10 md:grid-cols-2">
          <section aria-label="Accessibility">
            <Meta>Accessibility · beginners, included</Meta>
            <TileGrid>
              <StatTile value={`${o.accessibility.startedPct}%`} label="of students have finished at least one milestone" pct={o.accessibility.startedPct} />
              <StatTile value={o.accessibility.beginnersActive} unit="active" label="zero-milestone students active this week — the ones not to lose" />
            </TileGrid>
          </section>
          <section aria-label="Readiness">
            <Meta>Readiness · documented work</Meta>
            <TileGrid cols={3}>
              <StatTile value={`${o.readiness.completion}%`} label="average roadmap completion today" pct={o.readiness.completion} />
              <StatTile value={o.readiness.merges} unit="merges" label="verified open-source merges, all time" />
              <StatTile value={o.readiness.projects} unit="shipped" label="projects by chapter members" />
            </TileGrid>
          </section>
          <section aria-label="Excellence">
            <Meta>Excellence · external proof</Meta>
            <TileGrid>
              <StatTile value={o.excellence.submissions} unit="entries" label="contest submissions awaiting or earning judgment" />
              <StatTile value={o.excellence.merges} unit="merges" label="into real-world, global projects" />
            </TileGrid>
            <p className="narrative mt-4">Victories live in the contests console — review the submissions inbox.</p>
          </section>
          <section aria-label="Network">
            <Meta>Network · feeding back in</Meta>
            <TileGrid cols={3}>
              <StatTile value={o.network.mentors} unit="guides" label="mentors available to juniors right now" />
              <StatTile value={o.network.eventsHeld} unit="held" label="gatherings so far, materials archived" />
              <StatTile value={o.network.partnerships} unit="active" label="chapter partnerships sharing resources" />
            </TileGrid>
          </section>
        </div>

        {departments.length > 0 && (
          <section id="departments" className="mt-12 scroll-mt-24 border-t pt-10" style={{ borderColor: "var(--line)" }} aria-label="Departments">
            <div className="flex items-baseline justify-between">
              <Meta>Departments · heads, size, pulse</Meta>
              <Link href="/lead" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Lead console →</Link>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {departments.map((d) => (
                <li key={d.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-lg font-medium" style={{ color: "var(--text)" }}>{d.name}</span>
                    <span className="meta shrink-0">{d.vertical}</span>
                  </div>
                  <p className="meta mt-1">
                    {d.head_name ? `Head: ${d.head_name}` : "No head assigned"}{d.co_head_name ? ` · Co-Head: ${d.co_head_name}` : ""}
                  </p>
                  <p className="mt-3 font-mono text-sm" style={{ color: "var(--text)" }}>
                    {d.members} <span className="font-sans text-xs" style={{ color: "var(--text-muted)" }}>
                      members{d.core_requests > 0 ? ` · ${d.core_requests} Core request${d.core_requests === 1 ? "" : "s"}` : ""}{d.successors > 0 ? ` · ${d.successors} successor${d.successors === 1 ? "" : "s"}` : ""}
                    </span>
                  </p>
                  <p className="meta mt-1">
                    {d.last_activity ? `last logged ${new Date(d.last_activity).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}` : "nothing logged yet"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 grid gap-12 border-t pt-10 lg:grid-cols-2" style={{ borderColor: "var(--line)" }}>
          <section id="attention" className="scroll-mt-24" aria-label="Attention queue">
            <Meta>Attention queue</Meta>
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {attention.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} prefetch={false} className="row-link flex items-baseline justify-between gap-3 px-2 py-3.5">
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{a.label}</span>
                    <span className="figure-mono text-base font-semibold" style={{ color: a.count > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                      {a.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="narrative mt-4">Triage oldest first. Every action you take writes to the audit trail below.</p>
          </section>

          <section id="upcoming" className="scroll-mt-24" aria-label="Upcoming">
            <div className="flex items-baseline justify-between">
              <Meta>Upcoming gatherings</Meta>
              <Link href="/admin/events" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Manage →</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="narrative mt-3">Nothing on the calendar. Chapters that gather, grow — schedule the next one.</p>
            ) : (
              <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
                {upcoming.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-4 py-3">
                    <span className="meta w-24 shrink-0">
                      {new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </span>
                    <Link href="/admin/events" prefetch={false} className="truncate text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>
                      {e.title}
                    </Link>
                    <span className="meta ml-auto shrink-0">{e.event_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section id="audit" className="mt-12 scroll-mt-24" aria-label="Audit trail">
          <div className="flex items-baseline justify-between">
            <Meta>Latest admin actions</Meta>
            <Link href="/admin/audit" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Full log →</Link>
          </div>
          <div className="mt-2">
            {auditEntries.length === 0 ? (
              <p className="narrative mt-3">No admin actions recorded yet. They'll stream in here — who did what, and when.</p>
            ) : (
              <ActivityStream
                items={auditEntries.map((e) => ({
                  text: `${e.action.replaceAll("_", " ")} — ${e.resource} ${String(e.resource_id || "").slice(0, 8)}`,
                  meta: `${e.actor_id} · ${new Date(e.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                }))}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
