"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Meta } from "@/components/loom/primitives";
import { StatTile, TileGrid } from "@/components/loom/StatTiles";
import { ActivityStream } from "@/components/loom/Evidence";
import { GrantCoreButton, SuccessionToggle, WorkshopForm, ApproveEventButton, ReportCard } from "@/components/lead/LeadActions";
import { RosterLevelBars, WorkshopTimelineBars, ApprovalDonut } from "@/components/lead/LeadCharts";

function Skel({ h = 14 }) {
  return <div className="skel" style={{ height: h, width: "100%" }} />;
}

export function LeadConsoleTabs({ initialData, userId, isVertical }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [liveAt, setLiveAt] = useState(Date.now());

  const fetchLive = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch("/api/lead/overview", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) { setData(j.data); setLiveAt(Date.now()); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = setInterval(fetchLive, 15000);
    const onVis = () => { if (document.visibilityState === "visible") fetchLive(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [fetchLive]);

  const pendingRequests = data.roster.filter((r) => r.core_requested && r.level === "general");
  const byDept = data.departments.map((d) => ({
    ...d,
    members: data.roster.filter((r) => r.department_id === d.id),
    requests: data.roster.filter((r) => r.department_id === d.id && r.core_requested && r.level === "general")
  }));
  const rosterLevels = ["general", "core", "dept_lead"].map((lvl) => ({
    name: lvl,
    value: data.roster.filter((r) => r.level === lvl).length,
  }));
  const workshopTimeline = [...data.workshops].slice(0, 8).map((w) => ({
    label: new Date(w.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    value: 1, title: w.title,
  }));
  const approvalDonut = [
    { name: "Core requests", value: pendingRequests.length },
    { name: "Proposed events", value: data.proposed.length },
  ];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "roster", label: `Roster · ${data.roster.length}` },
    { id: "workshops", label: "Workshops" },
    { id: "reports", label: "Reports" },
    ...(isVertical ? [{ id: "succession", label: "Succession" }] : []),
  ];
  if (!isVertical) tabs.splice(2, 0); // keep order overview, roster, workshops, reports

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mono-tag">Live</span>
        <span className="size-2 rounded-full animate-pulse" style={{ background: loading ? "var(--warn)" : "var(--success)" }} />
        <span className="mono-tag">{loading ? "syncing…" : `synced ${new Date(liveAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · poll 15s`}</span>
        <button onClick={fetchLive} className="ml-auto btn-ghost !py-1.5 !text-xs">Refresh</button>
      </div>

      <div className="mt-6 flex gap-1.5 overflow-x-auto rounded-full border p-1.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className="relative rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: active ? "var(--bg)" : "var(--text-muted)" }}>
              {active && <motion.span layoutId="lead-tab" className="absolute inset-0 rounded-full" style={{ background: "var(--text)" }} transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} className="mt-6">
          {tab === "overview" && (
            <div className="space-y-6">
              <TileGrid cols={3}>
                <motion.div whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 380 }}><StatTile value={data.roster.length} unit="members" label={isVertical ? "members across your vertical" : "members across your departments"} /></motion.div>
                <motion.div whileHover={{ y: -1 }}><StatTile value={pendingRequests.length} unit="waiting" label="Core requests needing a human" tone={pendingRequests.length > 0 ? "var(--accent)" : undefined} /></motion.div>
                <motion.div whileHover={{ y: -1 }}><StatTile value={data.workshops.length} unit="soon" label="upcoming workshops on the horizon" /></motion.div>
              </TileGrid>
              <div className="grid gap-4 lg:grid-cols-3">
                <RosterLevelBars data={rosterLevels} />
                <WorkshopTimelineBars data={workshopTimeline} />
                <ApprovalDonut data={approvalDonut} />
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
                        <span className="min-w-0"><span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{e.title}</span><span className="mono-tag">by {e.author_name || "a dept lead"} · {e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "unscheduled"}</span></span>
                        <span className="flex gap-2"><ApproveEventButton id={e.id} approve label="Approve" /><ApproveEventButton id={e.id} approve={false} label="Send back" /></span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {tab === "roster" && (
            <div className="grid gap-6 lg:grid-cols-2">
              {byDept.length === 0 ? <p className="narrative">No departments in your scope yet.</p> : byDept.map((d) => (
                <section key={d.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <div className="flex items-baseline justify-between"><h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>{d.name}</h2><span className="mono-tag">{d.members.length} member{d.members.length === 1 ? "" : "s"}</span></div>
                  {d.requests.length > 0 && <p className="mono-tag mt-2" style={{ color: "var(--accent)" }}>{d.requests.length} Core request{d.requests.length === 1 ? "" : "s"} open</p>}
                  <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {d.members.length === 0 && <li className="mono-tag">No members yet.</li>}
                    {d.members.map((m) => (
                      <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-[var(--wash)] transition" style={{ background: "var(--bg)" }}>
                        <span className="min-w-0 text-sm" style={{ color: "var(--text)" }}><span className="font-medium">{m.name}</span> <span className="mono-tag">{m.level}{m.core_requested && m.level === "general" ? " · requested Core" : ""}{m.succession_ready ? " · succession-ready" : ""}</span></span>
                        <span className="flex gap-2">{m.core_requested && m.level === "general" && <GrantCoreButton departmentId={d.id} userId={m.user_id} name={m.name || "member"} />}{(m.level === "core" || m.level === "dept_lead") && m.user_id !== userId && <SuccessionToggle departmentId={d.id} userId={m.user_id} name={m.name || "member"} ready={m.succession_ready} />}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {tab === "workshops" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <WorkshopForm departments={data.departments} />
              <div>
                {data.workshops.length === 0 ? <p className="narrative">No workshops on the horizon. Schedule the first one — your department learns by gathering.</p> : (
                  <ul className="divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                    {data.workshops.map((w) => (
                      <li key={w.id} className="flex items-baseline gap-4 p-4 hover:bg-[var(--wash)] transition"><span className="mono-tag w-24 shrink-0">{new Date(w.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span><span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text)" }}>{w.title}</span><span className="mono-tag shrink-0">{w.status}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === "reports" && (
            <div className="space-y-6">
              <section aria-label="Cross-department calendar">
                <Meta>Calendar</Meta>
                {data.conflicts.length > 0 && <p className="mt-3 rounded-xl border px-4 py-3 text-sm font-medium" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{data.conflicts.length} conflict{data.conflicts.length === 1 ? "" : "s"}: {data.conflicts.slice(0, 3).map((c) => `${c.a.title} × ${c.b.title}`).join(" · ")}</p>}
                {data.calendar.length === 0 ? <p className="narrative mt-3">Nothing upcoming in your vertical.</p> : (
                  <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                    {data.calendar.map((e) => <li key={e.id} className="flex items-baseline gap-4 p-4 hover:bg-[var(--wash)] transition"><span className="mono-tag w-24 shrink-0">{new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span><span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text)" }}>{e.title}</span><span className="mono-tag shrink-0">{e.department_name || "society"}</span></li>)}
                  </ul>
                )}
              </section>
              {data.recentLogs.length > 0 && <section><Meta>Recently logged</Meta><div className="mt-2"><ActivityStream items={data.recentLogs.map((c) => ({ text: `${c.student_name || "A member"} logged: ${c.title}`, meta: c.kind }))} /></div></section>}
              <section><Meta>Monthly report</Meta><div className="mt-3 grid gap-6 lg:grid-cols-2"><ReportCard departments={data.departments} /><p className="narrative">Compiling pulls live counts — contributions by kind, events held, new members, upcoming workshops.</p></div></section>
            </div>
          )}

          {tab === "succession" && isVertical && (
            <section>
              <Meta>Succession across your vertical</Meta>
              {byDept.every((d) => d.members.filter((m) => m.succession_ready).length === 0) ? <p className="narrative mt-3">No department has flagged a successor yet.</p> : (
                <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                  {byDept.flatMap((d) => d.members.filter((m) => m.succession_ready).map((m) => <li key={`${d.id}-${m.user_id}`} className="flex items-baseline justify-between gap-3 p-4 hover:bg-[var(--wash)] transition"><span className="text-sm font-medium" style={{ color: "var(--text)" }}>{m.name}</span><span className="mono-tag">{d.name} · {m.level}</span></li>))}
                </ul>
              )}
            </section>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
