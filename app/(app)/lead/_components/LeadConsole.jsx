"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { Meta } from "@/components/loom/primitives";
import { ActivityStream } from "@/components/loom/Evidence";
import { GrantCoreButton, SuccessionToggle, WorkshopForm, ApproveEventButton, ReportCard } from "@/components/lead/LeadActions";
import { HandoverPanel } from "./HandoverPanel";
import {
  RosterLevelBars, ContributionMix, WorkshopFill, TurnoutBars, GrowthLine, DeptHealthBars
} from "@/components/lead/LeadCharts";

/**
 * The lead console body.
 *
 * There is deliberately NO tab bar here. Section navigation is owned by the
 * AppShell top nav (lib/nav.js `leadNav`), which points at real routes
 * (/lead, /lead/roster, /lead/workshops, /lead/reports, /lead/succession).
 * The previous version rendered a second, on-page pill bar over the same five
 * sections while the top nav also pointed at #roster / #workshops anchors —
 * two navigation systems for one page. Now there is one, and refreshing,
 * sharing a link, and browser back all work.
 */
export function LeadConsole({ initialData, userId, isVertical, section, termEnd = null }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [liveAt, setLiveAt] = useState(Date.now());

  const fetchLive = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch("/api/lead/overview", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) { setData(j.data); setLiveAt(Date.now()); }
    } catch { /* keep the last good payload rather than blanking the console */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = setInterval(fetchLive, 15000);
    const onVis = () => { if (document.visibilityState === "visible") fetchLive(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [fetchLive]);

  const charts = data.charts || {};
  const pendingRequests = data.roster.filter((r) => r.core_requested && r.level === "general");
  const byDept = data.departments.map((d) => ({
    ...d,
    members: data.roster.filter((r) => r.department_id === d.id),
    requests: data.roster.filter((r) => r.department_id === d.id && r.core_requested && r.level === "general")
  }));

  const cap = isVertical
    ? ["Approve society events", "View vertical calendar & conflicts", "Grant Core in vertical", "Recommend budget (not approve)", "Succession overview"]
    : ["Grant Core in own dept", "Publish dept workshops", "Propose society events (needs approval)", "Mark succession-ready", "Compile dept reports"];

  const StatusBar = (
    <div className="leadx-telemetry">
      <span className="leadx-live">
        <span className="leadx-live-dot" style={{ background: loading ? "var(--warn)" : "var(--success)" }} />
        Live feed
      </span>
      <span className="leadx-telemetry-item">
        {loading ? "Syncing" : `Synced ${new Date(liveAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
        <span> / 15s poll</span>
      </span>
      {termEnd && (
        <span className={`leadx-term ${new Date(termEnd) < new Date() ? "is-expired" : ""}`}>
          Term {new Date(termEnd) < new Date() ? "ended" : "ends"}{" "}
          {new Date(termEnd).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      )}
      <button onClick={fetchLive} className="leadx-refresh">Refresh</button>
    </div>
  );

  const Capability = (
    <section className="leadx-note leadx-canon">
      <p className="leadx-note-kicker">Rules of engagement</p>
      <h2 className="leadx-note-title">{isVertical ? "Vertical command" : "Department command"}</h2>
      <ul className="leadx-rule-list">
        {cap.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <p className="leadx-note-foot">
        Tenant-scoped / audit-logged / upward-only. Review the trail at <span>/admin/audit</span>.
      </p>
    </section>
  );

  function Overview() {
    const signals = [
      { value: data.roster.length, unit: "members", label: isVertical ? "Across your vertical" : "Across your departments" },
      { value: pendingRequests.length, unit: "requests", label: "Core requests waiting on a human" },
      { value: data.workshops.length, unit: "events", label: "Gatherings on the horizon" },
      { value: charts.turnoutPct ?? "-", unit: charts.turnoutPct == null ? "" : "%", label: "Turnout across past events" }
    ];
    const quiet = pendingRequests.length === 0;

    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} className="leadx-overview">
        <div className="leadx-brief">
          <div className="leadx-main">
            <section className="leadx-signals" aria-label="Vertical signals">
              {signals.map((s) => (
                <div key={s.label} className="leadx-signal">
                  <p className="leadx-signal-value">
                    {s.value}
                    {s.unit && <span>{s.unit}</span>}
                  </p>
                  <p className="leadx-signal-label">{s.label}</p>
                </div>
              ))}
            </section>

            <div className="leadx-instruments" aria-label="Operational signals">
              <div className="leadx-instrument is-wide"><RosterLevelBars data={charts.rosterLevels} /></div>
              <div className="leadx-instrument"><ContributionMix data={charts.contributionKinds} /></div>
              <div className="leadx-instrument"><GrowthLine data={charts.growth} /></div>
              <div className="leadx-instrument is-wide"><DeptHealthBars data={charts.deptHealth} /></div>
            </div>
          </div>

          <aside className="leadx-rail" aria-label="Decisions">
            {Capability}

            <section className="leadx-note leadx-orders">
              <div className="leadx-note-head">
                <div>
                  <p className="leadx-note-kicker">On your desk</p>
                  <h2 className="leadx-note-title">Core requests</h2>
                </div>
                <span className={`leadx-count ${quiet ? "is-clear" : ""}`}>{pendingRequests.length}</span>
              </div>
              {quiet ? (
                <p className="leadx-empty">No Core requests waiting. The roster is settled.</p>
              ) : (
                <ul className="leadx-order-list">
                  {pendingRequests.map((r) => {
                    const dept = data.departments.find((d) => d.id === r.department_id);
                    return (
                      <li key={`${r.department_id}-${r.user_id}`} className="leadx-order">
                        <span className="leadx-order-copy">
                          <strong>{r.name}</strong>
                          <small>wants Core in {dept?.name || "your scope"}</small>
                        </span>
                        <GrantCoreButton departmentId={r.department_id} userId={r.user_id} name={r.name || "member"} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {isVertical && (
              <section className="leadx-note leadx-orders">
                <div className="leadx-note-head">
                  <div>
                    <p className="leadx-note-kicker">Cross-check</p>
                    <h2 className="leadx-note-title">Society events</h2>
                  </div>
                  <span className={`leadx-count ${data.proposed.length === 0 ? "is-clear" : ""}`}>{data.proposed.length}</span>
                </div>
                {data.proposed.length === 0 ? (
                  <p className="leadx-empty">Nothing awaiting approval.</p>
                ) : (
                  <ul className="leadx-order-list">
                    {data.proposed.map((e) => (
                      <li key={e.id} className="leadx-order leadx-order-stack">
                        <span className="leadx-order-copy">
                          <strong>{e.title}</strong>
                          <small>by {e.author_name || "a dept lead"} / {e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "unscheduled"}</small>
                        </span>
                        <span className="leadx-order-actions">
                          <ApproveEventButton id={e.id} approve label="Approve" />
                          <ApproveEventButton id={e.id} approve={false} label="Send back" />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </aside>
        </div>
      </motion.div>
    );
  }

  function Roster() {
    const [q, setQ] = useState("");
    const needle = q.trim().toLowerCase();
    const match = (m) => `${m.name} ${m.year || ""} ${m.github_username || ""}`.toLowerCase().includes(needle);
    const totalMatches = byDept.reduce((s, d) => s + d.members.filter(match).length, 0);

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roster by name, year, github…"
            className="min-w-[220px] flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }} aria-label="Search roster" />
          {q && <button onClick={() => setQ("")} className="btn-ghost !py-1.5 !text-xs">Clear</button>}
          <span className="mono-tag">{q ? `${totalMatches} match${totalMatches === 1 ? "" : "es"}` : `${data.roster.length} total`}</span>
        </div>
        {data.roster.length >= 300 && !q && (
          <p className="mono-tag" style={{ color: "var(--warn)" }}>
            Showing the first 300 memberships. Narrow the search to reach anyone outside this window.
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          {byDept.length === 0 ? <p className="narrative">No departments in your scope yet.</p> : byDept.map((d) => {
            const visible = q ? d.members.filter(match) : d.members;
            return (
              <section key={d.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>{d.name}</h2>
                  <span className="mono-tag">{visible.length}/{d.members.length} member{d.members.length === 1 ? "" : "s"}</span>
                </div>
                {d.requests.length > 0 && (
                  <p className="mono-tag mt-2" style={{ color: "var(--accent)" }}>
                    {d.requests.length} Core request{d.requests.length === 1 ? "" : "s"} open — audited, tenant-scoped
                  </p>
                )}
                <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {visible.length === 0 && <li className="mono-tag">{q ? "No matches" : "No members yet."}</li>}
                  {visible.map((m) => (
                    <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--wash)] transition" style={{ background: "var(--bg)" }}>
                      <span className="min-w-0 text-sm" style={{ color: "var(--text)" }}>
                        <span className="font-medium">{m.name}</span>{" "}
                        <span className="mono-tag">
                          {m.level}{m.core_requested && m.level === "general" ? " · requested Core" : ""}{m.succession_ready ? " · succession-ready" : ""} · yr {m.year || "—"} · @{m.github_username || "—"}
                        </span>
                      </span>
                      <span className="flex gap-2">
                        {m.core_requested && m.level === "general" && <GrantCoreButton departmentId={d.id} userId={m.user_id} name={m.name || "member"} />}
                        {(m.level === "core" || m.level === "dept_lead") && m.user_id !== userId && (
                          <SuccessionToggle departmentId={d.id} userId={m.user_id} name={m.name || "member"} ready={m.succession_ready} />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  function Workshops() {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkshopFill data={charts.workshopFill} />
          <TurnoutBars data={charts.turnout} turnoutPct={charts.turnoutPct} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <WorkshopForm departments={data.departments} />
          <div>
            {data.workshops.length === 0 ? (
              <p className="narrative">No workshops on the horizon. Schedule the first one — your department learns by gathering.</p>
            ) : (
              <ul className="divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                {data.workshops.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-baseline gap-3 p-4 hover:bg-[var(--wash)] transition">
                    <span className="mono-tag w-24 shrink-0">{new Date(w.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text)" }}>{w.title}</span>
                    {w.capacity ? (
                      <span className="mono-tag shrink-0">{w.registered_count}/{w.capacity} seats</span>
                    ) : (
                      <span className="mono-tag shrink-0">open registration</span>
                    )}
                    <span className="mono-tag shrink-0">{w.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  function Reports() {
    return (
      <div className="space-y-6">
        <section aria-label="Calendar">
          <Meta>Calendar {isVertical ? "across your vertical" : "for your departments"}</Meta>
          {data.conflicts.length > 0 && (
            <p className="mt-3 rounded-xl border px-4 py-3 text-sm font-medium" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
              {data.conflicts.length} conflict{data.conflicts.length === 1 ? "" : "s"}:{" "}
              {data.conflicts.slice(0, 3).map((c) => `${c.a.title} × ${c.b.title}`).join(" · ")}
            </p>
          )}
          {data.calendar.length === 0 ? (
            <p className="narrative mt-3">
              {isVertical
                ? "Nothing upcoming in your vertical."
                : "Nothing upcoming in your departments. Schedule a workshop and it will appear here."}
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
              {data.calendar.map((e) => (
                <li key={e.id} className="flex items-baseline gap-4 p-4 hover:bg-[var(--wash)] transition">
                  <span className="mono-tag w-24 shrink-0">{new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text)" }}>{e.title}</span>
                  <span className="mono-tag shrink-0">{e.department_name || "society"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <Meta>Recently logged</Meta>
          <div className="mt-2">
            {data.recentLogs.length === 0
              ? <p className="narrative">Nothing logged in the contribution ledger yet.</p>
              : <ActivityStream items={data.recentLogs.map((c) => ({ text: `${c.student_name || "A member"} logged: ${c.title}`, meta: c.kind }))} />}
          </div>
        </section>

        <section>
          <Meta>Monthly report</Meta>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <ReportCard departments={data.departments} />
            <div className="space-y-3">
              <p className="narrative">Compiling pulls live counts — contributions by kind, events held, new members, upcoming workshops.</p>
              <ContributionMix data={charts.contributionKinds} />
            </div>
          </div>
        </section>
      </div>
    );
  }

  function Succession() {
    const ready = byDept.flatMap((d) => d.members.filter((m) => m.succession_ready).map((m) => ({ ...m, dept: d.name })));
    return (
      <section>
        <HandoverPanel />
        <Meta className="mt-6 block">Succession {isVertical ? "across your vertical" : "in your departments"}</Meta>
        <p className="narrative mt-1">
          A department with no succession-ready member is one tenure away from starting from zero.
        </p>
        {ready.length === 0 ? (
          <p className="narrative mt-3">No department has flagged a successor yet.</p>
        ) : (
          <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
            {ready.map((m) => (
              <li key={`${m.department_id}-${m.user_id}`} className="flex items-baseline justify-between gap-3 p-4 hover:bg-[var(--wash)] transition">
                <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{m.name}</span>
                <span className="mono-tag">{m.dept} · {m.level}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const views = { overview: Overview, roster: Roster, workshops: Workshops, reports: Reports, succession: Succession };
  const View = views[section] || Overview;

  return (
    <div>
      {StatusBar}
      <div className="mt-6"><View /></div>
    </div>
  );
}