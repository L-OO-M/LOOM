"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { Meta } from "@/components/loom/primitives";
import { StatTile, TileGrid } from "@/components/loom/StatTiles";
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
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="mono-tag">Live</span>
      <span className="size-2 rounded-full animate-pulse" style={{ background: loading ? "var(--warn)" : "var(--success)" }} />
      <span className="mono-tag">{loading ? "syncing…" : `synced ${new Date(liveAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · poll 15s`}</span>
      {termEnd && (
        <span
          className="mono-tag rounded-full border px-2.5 py-1"
          style={{
            borderColor: new Date(termEnd) < new Date() ? "var(--danger)" : "var(--line)",
            color: new Date(termEnd) < new Date() ? "var(--danger)" : "var(--text-muted)"
          }}
        >
          Term {new Date(termEnd) < new Date() ? "ended" : "ends"}{" "}
          {new Date(termEnd).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      )}
      <button onClick={fetchLive} className="ml-auto btn-ghost !py-1.5 !text-xs">Refresh</button>
    </div>
  );

  const Capability = (
    <section className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--accent) 5%, var(--bg-elevated))" }}>
      <Meta>What you can do — {isVertical ? "Vertical Lead" : "Dept Lead"} · scoped, audited, no self-escalation</Meta>
      <ul className="mt-2 flex flex-wrap gap-2">
        {cap.map((c) => <li key={c} className="mono-tag rounded-full border px-2.5 py-1" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>{c}</li>)}
      </ul>
      <p className="mono-tag mt-2">All writes are tenant-scoped, audit-logged, and upward-only — see <span style={{ color: "var(--text)" }}>/admin/audit</span>.</p>
    </section>
  );

  function Overview() {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} className="space-y-6">
        {Capability}
        <TileGrid cols={4}>
          <motion.div whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 380 }}>
            <StatTile value={data.roster.length} unit="members" label={isVertical ? "members across your vertical" : "members across your departments"} />
          </motion.div>
          <motion.div whileHover={{ y: -1 }}>
            <StatTile value={pendingRequests.length} unit="waiting" label="Core requests needing a human" tone={pendingRequests.length > 0 ? "var(--accent)" : undefined} />
          </motion.div>
          <motion.div whileHover={{ y: -1 }}>
            <StatTile value={data.workshops.length} unit="soon" label="events on the horizon" />
          </motion.div>
          <motion.div whileHover={{ y: -1 }}>
            <StatTile value={charts.turnoutPct ?? "—"} unit={charts.turnoutPct == null ? "" : "%"} label="turnout on past events" />
          </motion.div>
        </TileGrid>

        <div className="grid gap-4 lg:grid-cols-2">
          <RosterLevelBars data={charts.rosterLevels} />
          <ContributionMix data={charts.contributionKinds} />
          <GrowthLine data={charts.growth} />
          <DeptHealthBars data={charts.deptHealth} />
        </div>

        {pendingRequests.length > 0 && (
          <section className="rounded-2xl border p-5" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 6%, var(--bg-elevated))" }}>
            <Meta style={{ color: "var(--accent)" }}>{pendingRequests.length} Core request{pendingRequests.length === 1 ? "" : "s"} waiting</Meta>
            <ul className="mt-3 space-y-3">
              {pendingRequests.map((r) => {
                const dept = data.departments.find((d) => d.id === r.department_id);
                return (
                  <li key={`${r.department_id}-${r.user_id}`} className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: "var(--text)" }}><strong>{r.name}</strong> <span style={{ color: "var(--text-muted)" }}>wants Core in {dept?.name}</span></span>
                    <GrantCoreButton departmentId={r.department_id} userId={r.user_id} name={r.name || "member"} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {isVertical && data.proposed.length > 0 && (
          <section aria-label="Approval queue">
            <Meta>Society events awaiting your cross-check</Meta>
            <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
              {data.proposed.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-[var(--wash)] transition">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{e.title}</span>
                    <span className="mono-tag">by {e.author_name || "a dept lead"} · {e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "unscheduled"}</span>
                  </span>
                  <span className="flex gap-2">
                    <ApproveEventButton id={e.id} approve label="Approve" />
                    <ApproveEventButton id={e.id} approve={false} label="Send back" />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
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