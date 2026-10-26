"use client";

import Link from "next/link";
import { Clock3, Users, Layers, Sparkles, ShieldCheck, ArrowUpRight, Inbox, CalendarDays, Building2, AlertCircle } from "lucide-react";
import { RoleDonut, ProjectStatusBars, ActivitySparklineChart } from "@/components/admin/OverviewCharts";

function fmtDate(d) {
  try { return new Date(d).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return String(d); }
}
function timeAgo(v) {
  try { return new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" }); } catch { return ""; }
}

const DEPT_TONES = ["var(--accent)", "var(--info)", "var(--success)", "var(--warn)"];
function deptTone(value = "") {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return DEPT_TONES[hash % DEPT_TONES.length];
}

/* Admin overview: a chapter ledger rather than a card wall.
   The masthead states the immediate human cost, the four pillars read as
   ruled entries, and the operational queues stay in the lower half. */

export function AdminDashboard({ tenantName, totalStudents = 0, outcomes, attention, departments = [], upcoming, auditEntries, charts = null }) {
  const waiting = attention.reduce((s, a) => s + a.count, 0);
  const o = outcomes;
  const sortedAttention = [...attention].sort((a, b) => b.count - a.count);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const pillars = [
    {
      id: "01",
      name: "Accessibility",
      note: "Beginners included, not just enrolled.",
      icon: Users,
      metrics: [
        { value: `${o.accessibility.startedPct}%`, label: "finished at least one milestone", meter: o.accessibility.startedPct },
        { value: o.accessibility.beginnersActive, unit: "active", label: "zero-milestone students this week" }
      ],
      href: "/admin/students",
      link: "View roster"
    },
    {
      id: "02",
      name: "Readiness",
      note: "Documented work, not private enthusiasm.",
      icon: Layers,
      metrics: [
        { value: `${o.readiness.completion}%`, label: "average roadmap completion today", meter: o.readiness.completion },
        { value: o.readiness.projects, unit: "projects", label: "shipped by chapter members" }
      ],
      href: "/admin/roadmaps",
      link: "View roadmaps"
    },
    {
      id: "03",
      name: "Excellence",
      note: "External proof that the work travelled.",
      icon: Sparkles,
      metrics: [
        { value: o.excellence.submissions, unit: "entries", label: "contest submissions under judgment" },
        { value: o.excellence.merges, unit: "merges", label: "verified into real projects" }
      ],
      href: "/admin/contests",
      link: "Review entries"
    },
    {
      id: "04",
      name: "Network",
      note: "The people and rooms feeding the chapter back.",
      icon: Building2,
      metrics: [
        { value: o.network.mentors, unit: "guides", label: "mentors available now" },
        { value: o.network.eventsHeld, unit: "held", label: "gatherings to date" },
        { value: o.network.partnerships, unit: "active", label: "chapter partnerships" }
      ],
      href: "/admin/mentors",
      link: "Mentor desk"
    }
  ];

  const attentionCount = (needle) => attention.find((a) => a.label.toLowerCase().includes(needle))?.count ?? 0;
  const glance = [
    { value: departments.length, label: "Departments" },
    { value: attentionCount("core request"), label: "Core requests" },
    { value: attentionCount("proposed"), label: "Proposed events" },
    { value: attentionCount("flag"), label: "Flagged this week" }
  ];

  return (
    <main className="adminx-shell animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="adminx-masthead">
        <div className="adminx-masthead-bar">
          <span className="adminx-seal"><ShieldCheck size={12} /> Chapter desk</span>
          <span>{today}</span>
          {tenantName && <span>/ {tenantName}</span>}
        </div>

        <div className="adminx-masthead-grid">
          <div className="adminx-masthead-copy">
            <p className="adminx-kicker">Operations / chapter</p>
            <h1 className="adminx-title">
              {waiting > 0 ? (
                <>
                  <span>{waiting} {waiting === 1 ? "thing needs" : "things need"}</span>{" "}
                  a human.
                </>
              ) : (
                "All clear. The chapter is in session."
              )}
            </h1>
            <p className="adminx-desc">
              {waiting > 0
                ? "Triage the queue below, oldest first. Every decision writes to the audit trail."
                : "All queues are clear. Review a department, publish the next gathering, or read the audit stream."}
            </p>
          </div>

          <div className="adminx-glance" aria-label="Chapter at a glance">
            {glance.map((g) => (
              <div key={g.label} className="adminx-glance-item">
                <strong>{g.value}</strong>
                <span>{g.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="adminx-ledger" aria-label="Four pillars">
        <div className="adminx-ledger-head">
          <span>Four pillars</span>
          <span>Live chapter measures</span>
        </div>
        {pillars.map((p) => {
          const Icon = p.icon;
          return (
            <article key={p.id} className="adminx-ledger-row">
              <span className="adminx-ledger-index">{p.id}</span>
              <div className="adminx-ledger-copy">
                <h2><Icon size={14} /> {p.name}</h2>
                <p>{p.note}</p>
              </div>
              <div className="adminx-ledger-metrics">
                {p.metrics.map((m) => (
                  <div key={m.label} className="adminx-metric">
                    <p className="adminx-metric-value">
                      {m.value}
                      {m.unit && <span>{m.unit}</span>}
                    </p>
                    {m.meter != null && (
                      <span className="adminx-meter" aria-hidden="true">
                        <span style={{ width: `${Math.max(0, Math.min(100, Number(m.meter) || 0))}%` }} />
                      </span>
                    )}
                    <p className="adminx-metric-label">{m.label}</p>
                  </div>
                ))}
              </div>
              {p.href ? (
                <Link href={p.href} prefetch={false} className="adminx-ledger-link">
                  {p.link} <ArrowUpRight size={12} />
                </Link>
              ) : (
                <span className="adminx-ledger-link is-quiet">{totalStudents} enrolled</span>
              )}
            </article>
          );
        })}
      </section>

      {charts && (
        <section className="adminx-board" aria-label="Chapter visuals">
          <div className="adminx-board-head">
            <div>
              <p className="adminx-kicker">Signal board</p>
              <h2>The shape of the chapter.</h2>
            </div>
            <span className="adminx-board-note">Hover a mark for the count</span>
          </div>
          <div className="adminx-chart-grid">
            <div className="adminx-chart"><RoleDonut data={charts.roleDist} /></div>
            <div className="adminx-chart"><ProjectStatusBars data={charts.projectStatus} /></div>
            <div className="adminx-chart"><ActivitySparklineChart data={charts.dailyActivity} /></div>
          </div>
        </section>
      )}

      <section className="adminx-directory" aria-label="Departments">
        <div className="adminx-section-head">
          <div>
            <p className="adminx-kicker">Directory</p>
            <h2>Departments</h2>
          </div>
          <Link href="/admin/departments" prefetch={false} className="adminx-inline-link">
            Manage departments <ArrowUpRight size={12} />
          </Link>
        </div>

        {departments.length === 0 ? (
          <div className="adminx-empty adminx-empty-wide">
            <p>No departments yet.</p>
            <span>Create the first one to assign heads, track membership, and scope roadmaps.</span>
            <Link href="/admin/departments" prefetch={false} className="btn-ink">Create department</Link>
          </div>
        ) : (
          <ul className="adminx-dept-list">
            {departments.map((d) => (
              <li key={d.id} className="adminx-dept">
                <span className="adminx-dept-mark" style={{ background: deptTone(d.vertical) }} aria-hidden="true" />
                <div className="adminx-dept-name">
                  <strong>{d.name}</strong>
                  <small>{d.vertical} / {d.is_active ? "active" : "inactive"}</small>
                </div>
                <div className="adminx-dept-head">
                  <small>Head</small>
                  <span>{d.head_name || "Unassigned"}</span>
                  {d.co_head_name && <em>Co-head: {d.co_head_name}</em>}
                </div>
                <div className="adminx-dept-counts">
                  <span><strong>{d.members}</strong> members</span>
                  {d.core_requests > 0 && <span className="is-alert"><AlertCircle size={11} /> {d.core_requests} Core</span>}
                  {d.successors > 0 && <span>{d.successors} ready</span>}
                </div>
                <span className="adminx-dept-pulse">
                  <Clock3 size={11} />
                  {d.last_activity ? timeAgo(d.last_activity) : "No activity"}
                </span>
                <Link href="/admin/departments" prefetch={false} aria-label={`Manage ${d.name}`} className="adminx-dept-open">
                  <ArrowUpRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="adminx-dispatch-grid">
        <section className="adminx-dispatch" aria-label="Attention queue">
          <div className="adminx-dispatch-head">
            <div>
              <p className="adminx-kicker">Needs a human</p>
              <h2><Inbox size={15} /> Attention queue</h2>
            </div>
            <span className={`adminx-count ${waiting === 0 ? "is-clear" : ""}`}>{waiting}</span>
          </div>
          <p className="adminx-dispatch-note">
            {waiting > 0 ? "Sorted by urgency. Every action is audited." : "All queues clear."}
          </p>
          <ul className="adminx-queue">
            {sortedAttention.map((a) => (
              <li key={`${a.href}-${a.label}`}>
                <Link href={a.href} prefetch={false} className={`adminx-queue-row ${a.count > 0 ? "is-live" : ""}`}>
                  <span className="adminx-queue-dot" aria-hidden="true" />
                  <span className="adminx-queue-label">{a.label}</span>
                  <span className="adminx-queue-count">{a.count}</span>
                  <ArrowUpRight size={13} className="adminx-queue-arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="adminx-dispatch" aria-label="Upcoming">
          <div className="adminx-dispatch-head">
            <div>
              <p className="adminx-kicker">Calendar</p>
              <h2><CalendarDays size={15} /> Upcoming gatherings</h2>
            </div>
            <Link href="/admin/events" prefetch={false} className="adminx-inline-link">Manage</Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="adminx-empty">
              <p>Nothing on the calendar.</p>
              <span>Chapters that gather, grow. Schedule the next one.</span>
              <Link href="/admin/events" prefetch={false} className="btn-ink">Create event</Link>
            </div>
          ) : (
            <ul className="adminx-event-list">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <span className="adminx-event-date">
                    {new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                  </span>
                  <Link href="/admin/events" prefetch={false} className="adminx-event-title">{e.title}</Link>
                  <span className="adminx-event-type">{e.event_type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="adminx-log" aria-label="Audit trail">
        <div className="adminx-section-head">
          <div>
            <p className="adminx-kicker">Trail</p>
            <h2><Clock3 size={15} /> Latest admin actions</h2>
          </div>
          <Link href="/admin/audit" prefetch={false} className="adminx-inline-link">
            Full log <ArrowUpRight size={12} />
          </Link>
        </div>

        {auditEntries.length === 0 ? (
          <div className="adminx-empty adminx-empty-wide">
            <p>No admin actions recorded yet.</p>
            <span>Actions will stream in here: who did what, and when.</span>
          </div>
        ) : (
          <ol className="adminx-log-list">
            {auditEntries.map((e) => (
              <li key={e.id} className="adminx-log-row">
                <span className="adminx-log-mark" aria-hidden="true" />
                <div className="adminx-log-copy">
                  <p>
                    <span className="adminx-action">{String(e.action).replaceAll("_", " ")}</span>
                    {e.resource} <code>{String(e.resource_id || "").slice(0, 8)}</code>
                  </p>
                  <p className="adminx-log-meta">
                    <strong>{e.actor_name || String(e.actor_id).slice(0, 8)}</strong>
                    <span>/ {fmtDate(e.created_at)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
