"use client";

import Link from "next/link";
import { Clock3, Users, Layers, Sparkles, ShieldCheck, ArrowUpRight, Inbox, CalendarDays, Building2, AlertCircle } from "lucide-react";
import { Meta } from "@/components/loom/primitives";
import { StatTile, TileGrid } from "@/components/loom/StatTiles";

function fmtDate(d) {
  try { return new Date(d).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return String(d); }
}
function timeAgo(v) {
  try { return new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" }); } catch { return ""; }
}

/* Admin overview — operations console.
   Language: calm enterprise. Four pillars frame the chapter's own success
   metrics; the attention queue is the only place that demands action.
   Every number is a live prop. */

export function AdminDashboard({ tenantName, totalStudents = 0, outcomes, attention, departments = [], upcoming, auditEntries }) {
  const waiting = attention.reduce((s, a) => s + a.count, 0);
  const o = outcomes;
  const sortedAttention = [...attention].sort((a, b) => b.count - a.count);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <main className="animate-in mx-auto max-w-6xl px-4 pb-14 sm:px-6">
      {/* Header */}
      <div className="border-b pb-6 pt-2" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <ShieldCheck size={12} /> Operations
          </span>
          <span className="meta">· {today}</span>
          {tenantName && <span className="meta">· {tenantName}</span>}
          <span className="meta">· {totalStudents} student{totalStudents === 1 ? "" : "s"} · {departments.length} department{departments.length === 1 ? "" : "s"}</span>
        </div>
        <h1 className="h-product mt-4 max-w-3xl text-balance leading-tight" style={{ fontSize: "clamp(1.5rem, 3.5vw, 2rem)", color: "var(--text)" }}>
          {waiting > 0 ? (
            <><span style={{ color: "var(--accent)" }}>{waiting} {waiting === 1 ? "thing needs" : "things need"}</span> a human.</>
          ) : (
            "Nothing waiting. The chapter is humming."
          )}
        </h1>
        <p className="narrative mt-2 max-w-2xl">
          {waiting > 0
            ? "Triage the queue below — oldest first. Every action writes to the audit trail."
            : "All queues are clear. Use this time to review departments, publish the next gathering, or check the audit stream."}
        </p>
      </div>

      {/* KPI pillars */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section aria-label="Accessibility" className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}><Users size={14} /></span>
            <Meta>Accessibility · beginners, included</Meta>
          </div>
          <TileGrid>
            <StatTile value={`${o.accessibility.startedPct}%`} label="of students have finished at least one milestone" pct={o.accessibility.startedPct} />
            <StatTile value={o.accessibility.beginnersActive} unit="active" label="zero-milestone students active this week — the ones not to lose" />
          </TileGrid>
          <p className="meta mt-3" style={{ color: "var(--text-muted)" }}>{totalStudents} enrolled · {o.accessibility.startedPct}% started</p>
        </section>

        <section aria-label="Readiness" className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}><Layers size={14} /></span>
            <Meta>Readiness · documented work</Meta>
          </div>
          <TileGrid cols={2}>
            <StatTile value={`${o.readiness.completion}%`} label="average roadmap completion today" pct={o.readiness.completion} />
            <StatTile value={o.readiness.projects} unit="projects" label="shipped by chapter members" />
          </TileGrid>
        </section>

        <section aria-label="Excellence" className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}><Sparkles size={14} /></span>
            <Meta>Excellence · external proof</Meta>
          </div>
          <TileGrid>
            <StatTile value={o.excellence.submissions} unit="entries" label="contest submissions under judgment" />
            <StatTile value={o.excellence.merges} unit="merges" label="verified into real-world projects" />
          </TileGrid>
          <Link href="/admin/contests" prefetch={false} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Review submissions <ArrowUpRight size={12} />
          </Link>
        </section>

        <section aria-label="Network" className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}><Building2 size={14} /></span>
            <Meta>Network · feeding back in</Meta>
          </div>
          <TileGrid cols={3}>
            <StatTile value={o.network.mentors} unit="guides" label="mentors available now" />
            <StatTile value={o.network.eventsHeld} unit="held" label="gatherings to date" />
            <StatTile value={o.network.partnerships} unit="active" label="chapter partnerships" />
          </TileGrid>
        </section>
      </div>

      {/* Departments */}
      <section className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg)" }} aria-label="Departments">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: "var(--text-muted)" }} />
            <h2 className="text-sm font-semibold tracking-tight" style={{ color: "var(--text)" }}>Departments · heads, size, pulse</h2>
          </div>
          <Link href="/admin/departments" prefetch={false} className="group inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>
            Manage departments <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        {departments.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No departments yet</p>
            <p className="narrative mx-auto mt-2 max-w-md">Create your first department to assign heads, track membership, and scope roadmaps. Start with the technical verticals.</p>
            <Link href="/admin/departments" prefetch={false} className="btn-ink mt-4 inline-flex">Create department</Link>
          </div>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {departments.map((d) => (
              <li
                key={d.id}
                className="group relative overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display truncate text-[1.05rem] font-medium leading-tight" style={{ color: "var(--text)" }}>{d.name}</p>
                    <p className="meta mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>
                        {d.vertical}
                      </span>
                      <span className="size-1 rounded-full" style={{ background: d.is_active ? "var(--accent)" : "var(--line)" }} />
                      {d.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <Link href="/admin/departments" prefetch={false} aria-label={`Manage ${d.name}`} className="shrink-0 rounded-full border p-1.5 opacity-60 transition group-hover:opacity-100" style={{ borderColor: "var(--line)" }}>
                    <ArrowUpRight size={14} />
                  </Link>
                </div>

                <p className="meta mt-3 line-clamp-1">
                  {d.head_name ? `Head: ${d.head_name}` : <span style={{ color: "var(--text-muted)" }}>No head assigned</span>}{d.co_head_name ? ` · Co-Head: ${d.co_head_name}` : ""}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-baseline gap-1 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                    <span className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{d.members}</span>
                    <span style={{ color: "var(--text-muted)" }}>members</span>
                  </span>
                  {d.core_requests > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
                      <AlertCircle size={12} /> {d.core_requests} Core request{d.core_requests === 1 ? "" : "s"}
                    </span>
                  )}
                  {d.successors > 0 && (
                    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                      {d.successors} successor{d.successors === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                <p className="meta mt-2 flex items-center gap-1.5">
                  <Clock3 size={12} />
                  {d.last_activity ? `last activity ${timeAgo(d.last_activity)}` : "nothing logged yet"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Attention + Upcoming */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Attention queue">
          <div className="flex items-center gap-2">
            <Inbox size={16} style={{ color: waiting > 0 ? "var(--accent)" : "var(--text-muted)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Attention queue</h2>
            {waiting > 0 && <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--accent)", color: "white" }}>{waiting}</span>}
          </div>
          <p className="meta mt-1">{waiting > 0 ? `${waiting} items need a human — sorted by urgency` : "All queues clear"}</p>
          <ul className="mt-4 divide-y overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            {sortedAttention.map((a) => (
              <li key={`${a.href}-${a.label}`}>
                <Link
                  href={a.href}
                  prefetch={false}
                  className="group flex items-center justify-between gap-3 px-3.5 py-3.5 transition hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: a.count > 0 ? "var(--accent)" : "var(--line)" }} />
                    <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{a.label}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span
                      className="min-w-7 rounded-full px-2 py-1 text-center font-mono text-sm font-semibold leading-none"
                      style={{
                        background: a.count > 0 ? "color-mix(in srgb, var(--accent) 14%, var(--bg))" : "var(--bg-elevated)",
                        color: a.count > 0 ? "var(--accent)" : "var(--text-muted)",
                        border: `1px solid ${a.count > 0 ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "var(--line)"}`
                      }}
                    >
                      {a.count}
                    </span>
                    <ArrowUpRight size={14} className="opacity-40 transition group-hover:opacity-100 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Upcoming">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} style={{ color: "var(--text-muted)" }} />
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Upcoming gatherings</h2>
            </div>
            <Link href="/admin/events" prefetch={false} className="group inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              Manage <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing on the calendar. Chapters that gather, grow — schedule the next one.</p>
              <Link href="/admin/events" prefetch={false} className="btn-ink mt-3 inline-flex text-xs">Create event</Link>
            </div>
          ) : (
            <ul className="mt-4 divide-y overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3.5 py-3.5">
                  <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                    {new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                  </span>
                  <Link href="/admin/events" prefetch={false} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>
                    {e.title}
                  </Link>
                  <span className="meta shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize" style={{ borderColor: "var(--line)" }}>{e.event_type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Audit trail */}
      <section className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Audit trail">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <Clock3 size={14} style={{ color: "var(--text-muted)" }} /> Latest admin actions
          </h2>
          <Link href="/admin/audit" prefetch={false} className="group inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>
            Full log <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>
        {auditEntries.length === 0 ? (
          <p className="narrative mt-3 rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            No admin actions recorded yet. They&apos;ll stream in here — who did what, and when.
          </p>
        ) : (
          <ul className="mt-4 divide-y overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            {auditEntries.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-3.5 py-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: "var(--line)" }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-6" style={{ color: "var(--text)" }}>
                    <span className="font-mono text-xs rounded border px-1.5 py-0.5 mr-1.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                      {String(e.action).replaceAll("_", " ")}
                    </span>
                    {e.resource} <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{String(e.resource_id || "").slice(0, 8)}</span>
                  </p>
                  <p className="meta mt-0.5 flex flex-wrap gap-1">
                    <span className="font-medium" style={{ color: "var(--text)" }}>{e.actor_name || String(e.actor_id).slice(0, 8)}</span>
                    <span>· {fmtDate(e.created_at)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
