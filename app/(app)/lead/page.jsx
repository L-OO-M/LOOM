import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { getSql } from "@/lib/db";
import { getLeadOverview } from "@/lib/lead";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { StatTile, TileGrid } from "@/components/loom/StatTiles";
import { ActivityStream } from "@/components/loom/Evidence";
import { GrantCoreButton, SuccessionToggle, WorkshopForm, ApproveEventButton, ReportCard } from "@/components/lead/LeadActions";
import { RosterLevelBars, WorkshopTimelineBars, ApprovalDonut } from "@/components/lead/LeadCharts";

export default async function LeadConsolePage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/lead");
  const { user, profile, tenant } = ctx;
  if (!["dept_lead", "vertical_lead", "admin"].includes(profile.role)) redirect("/student");
  const sql = getSql();
  const data = await getLeadOverview(sql, { userId: user.id, profile, tenant });
  const isVertical = data.role === "vertical_lead" || data.role === "admin";
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
    value: 1,
    title: w.title,
  }));
  const approvalDonut = [
    { name: "Core requests", value: pendingRequests.length },
    { name: "Proposed events", value: data.proposed.length },
  ];

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 sm:px-6">
        <PageHeader
          kicker={isVertical ? "Vertical console" : "Department console"}
          title={isVertical ? "Your vertical, at a glance." : "Your department, run well."}
          desc={isVertical
            ? "Calendar, approvals, and succession across every department you oversee."
            : "Roster, requests, workshops, and the next generation of leads."}
        />

        <TileGrid cols={3}>
          <StatTile value={data.roster.length} unit="members" label={isVertical ? "members across your vertical" : "members across your departments"} />
          <StatTile value={pendingRequests.length} unit="waiting" label="Core requests needing a human" tone={pendingRequests.length > 0 ? "var(--accent)" : undefined} />
          <StatTile value={data.workshops.length} unit="soon" label="upcoming workshops on the horizon" />
        </TileGrid>

        <section className="mt-6 grid gap-4 lg:grid-cols-3" aria-label="Lead visuals">
          <RosterLevelBars data={rosterLevels} />
          <WorkshopTimelineBars data={workshopTimeline} />
          <ApprovalDonut data={approvalDonut} />
        </section>

        {pendingRequests.length > 0 && (
          <section className="rounded-2xl border p-5" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }} aria-label="Core requests">
            <Meta style={{ color: "var(--accent)" }}>{pendingRequests.length} Core request{pendingRequests.length === 1 ? "" : "s"} waiting</Meta>
            <ul className="mt-3 space-y-3">
              {pendingRequests.map((r) => {
                const dept = data.departments.find((d) => d.id === r.department_id);
                return (
                  <li key={`${r.department_id}-${r.user_id}`} className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: "var(--text)" }}>
                      <strong>{r.name}</strong> <span style={{ color: "var(--text-muted)" }}>wants Core in {dept?.name}</span>
                    </span>
                    <GrantCoreButton departmentId={r.department_id} userId={r.user_id} name={r.name || "member"} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {isVertical && data.proposed.length > 0 && (
          <section className="mt-8" aria-label="Approval queue">
            <Meta>Society events awaiting your cross-check</Meta>
            <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
              {data.proposed.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{e.title}</span>
                    <span className="meta">by {e.author_name || "a dept lead"} · {e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "unscheduled"}</span>
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

        {isVertical && (
          <section className="mt-8" aria-label="Cross-department calendar">
            <Meta>Cross-department calendar</Meta>
            {data.conflicts.length > 0 && (
              <p className="mt-3 rounded-xl border px-4 py-3 text-sm font-medium" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                {data.conflicts.length} scheduling conflict{data.conflicts.length === 1 ? "" : "s"}:{" "}
                {data.conflicts.slice(0, 3).map((c) => `${c.a.title} × ${c.b.title}`).join(" · ")}
              </p>
            )}
            {data.calendar.length === 0 ? (
              <p className="narrative mt-3">Nothing upcoming in your vertical. A quiet calendar is either peace or neglect — check which.</p>
            ) : (
              <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                {data.calendar.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-4 p-4">
                    <span className="meta w-24 shrink-0">{new Date(e.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text)" }}>{e.title}</span>
                    <span className="meta shrink-0">{e.department_name || "society"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          {byDept.map((d) => (
            <section key={d.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label={d.name}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>{d.name}</h2>
                <span className="meta">{d.members.length} member{d.members.length === 1 ? "" : "s"}</span>
              </div>
              {d.requests.length > 0 && (
                <p className="mt-2 text-xs font-semibold" style={{ color: "var(--accent)" }}>{d.requests.length} Core request{d.requests.length === 1 ? "" : "s"} open</p>
              )}
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {d.members.length === 0 && <li className="narrative text-sm">No members yet — they appear here the moment they join. Nothing to approve.</li>}
                {d.members.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-1.5" style={{ background: "var(--bg)" }}>
                    <span className="min-w-0 text-sm" style={{ color: "var(--text)" }}>
                      <span className="font-medium">{m.name}</span>{" "}
                      <span className="meta">{m.level}{m.core_requested && m.level === "general" ? " · requested Core" : ""}{m.succession_ready ? " · succession-ready" : ""}</span>
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {m.core_requested && m.level === "general" && (
                        <GrantCoreButton departmentId={d.id} userId={m.user_id} name={m.name || "member"} />
                      )}
                      {(m.level === "core" || m.level === "dept_lead") && m.user_id !== user.id && (
                        <SuccessionToggle departmentId={d.id} userId={m.user_id} name={m.name || "member"} ready={m.succession_ready} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {!isVertical && (
          <section className="mt-8" aria-label="Workshops">
            <Meta>Workshops</Meta>
            <div className="mt-3 grid gap-6 lg:grid-cols-2">
              <WorkshopForm departments={data.departments} />
              <div>
                {data.workshops.length === 0 ? (
                  <p className="narrative">No workshops on the horizon. Schedule the first one — your department learns by gathering.</p>
                ) : (
                  <ul className="divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                    {data.workshops.map((w) => (
                      <li key={w.id} className="flex items-baseline gap-4 p-4">
                        <span className="meta w-24 shrink-0">{new Date(w.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text)" }}>{w.title}</span>
                        <span className="meta shrink-0">{w.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}

        {data.recentLogs.length > 0 && (
          <section className="mt-8" aria-label="Recent contributions">
            <Meta>Recently logged in your departments</Meta>
            <div className="mt-2">
              <ActivityStream items={data.recentLogs.map((c) => ({
                text: `${c.student_name || "A member"} logged: ${c.title}`,
                meta: `${c.kind}`
              }))} />
            </div>
          </section>
        )}

        <section className="mt-8" aria-label="Monthly report">
          <Meta>Monthly report</Meta>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <ReportCard departments={data.departments} />
            <p className="narrative">Compiling pulls live counts — contributions by kind, events held, new members, upcoming workshops. Submit when it reads true; submitted reports feed the admin export.</p>
          </div>
        </section>

        {isVertical && (
          <section className="mt-8" aria-label="Succession">
            <Meta>Succession across your vertical</Meta>
            {byDept.every((d) => d.members.filter((m) => m.succession_ready).length === 0) ? (
              <p className="narrative mt-3">No department has flagged a successor yet. Nudge the Heads — continuity is the whole game.</p>
            ) : (
              <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                {byDept.flatMap((d) => d.members.filter((m) => m.succession_ready).map((m) => (
                  <li key={`${d.id}-${m.user_id}`} className="flex items-baseline justify-between gap-3 p-4">
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{m.name}</span>
                    <span className="meta">{d.name} · {m.level}</span>
                  </li>
                )))}
              </ul>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}
