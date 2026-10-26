import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { PLANNER_ENABLED } from "@/lib/feature-flags";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { loadPlanner, loadPlannerOwners, loadAssignableLeads } from "@/lib/planner-data";
import { PLANNER_TRACKS, formatWeekRange, trackLabel } from "@/lib/planner";
import { PlannerAdminForm } from "./PlannerAdminBits";
import { PlannerOwners } from "@/components/planner/PlannerOwners";
import "../_components/admin-ledger.css";

export const dynamic = "force-dynamic";

export default async function AdminPlannerPage() {
  if (!PLANNER_ENABLED) notFound();
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/planner");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/planner");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/admin");

  const data = await loadPlanner({ sql, tenantId: tenant.id });
  const owners = await loadPlannerOwners({ sql, tenantId: tenant.id });
  const assignable = await loadAssignableLeads({ sql, tenantId: tenant.id });
  const live = data.sessions.filter((s) => s.delivery_mode === "live").length;
  const deferred = data.sessions.filter((s) => s.delivery_mode === "deferred").length;
  const asyncPacks = data.sessions.filter((s) => s.delivery_mode === "async").length;

  const perWeek = data.weeks.map((w) => ({
    ...w,
    sessions: data.sessions.filter((s) => s.week_number === w.week_number),
    events: data.events.filter((e) => e.planner_week === w.week_number),
  }));

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Planner / ${data.academicYear}`}
          title="Collective master planner"
          lede="The single 28-week calendar across six wings. Sessions are seeded from the approved plan; society events are scheduled here and on the events console."
          meta={`${data.weeks.length} weeks / ${data.sessions.length} curriculum sessions / ${data.events.length} society events`}
          tone="field"
          art="/storyloom/learning.png"
          artAlt=""
          stats={[
            { value: data.weeks.length, label: "weeks planned" },
            { value: data.sessions.length, label: "curriculum sessions" },
            { value: live, label: "live sessions" },
            { value: `${deferred} / ${asyncPacks}`, label: "deferred / async" }
          ]}
          actions={
            <Link href="/admin/events" prefetch={false} style={{ color: "var(--accent)" }} className="aled-meta">
              Events console →
            </Link>
          }
        />

        <WorkspaceSection index="01" title="Weeks 01–28" note="Each row is a planner week: theme, delivery mode, track sessions, and any society events." action={<span className="aled-meta">{perWeek.length} weeks</span>}>
          <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
            {perWeek.map((w) => (
              <li key={w.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                <div className="aled-copy">
                  <span className="aled-title">
                    <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>W{String(w.week_number).padStart(2, "0")}</span>
                    {" · "}{w.theme}
                  </span>
                  <p className="aled-sub">{formatWeekRange(w)}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.4rem" }}>
                    {PLANNER_TRACKS.map((t) => {
                      const n = w.sessions.filter((s) => s.track_domain === t.key).length;
                      if (!n) return null;
                      return <span key={t.key} className="aled-tag">{trackLabel(t.key)} {n}</span>;
                    })}
                    {w.events.length ? <span className="aled-tag aled-tag--accent">Society {w.events.length}</span> : null}
                  </div>
                </div>
                <div className="aled-actions">
                  <span className="aled-tag" style={{ textTransform: "capitalize" }}>{w.delivery_mode}</span>
                  {w.is_relaxation ? <span className="aled-tag aled-tag--warn">Relaxation</span> : null}
                  {w.is_protected ? <span className="aled-tag aled-tag--info">Exam protection</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </WorkspaceSection>

        <div className="aled-split">
          <WorkspaceSection index="02" title="Schedule a society event" note="Linked to a planner week and blocked inside the 20 Nov–20 Dec relaxation window.">
            <div className="aled-panel">
              <PlannerAdminForm weeks={data.weeks} />
            </div>
          </WorkspaceSection>

          <WorkspaceSection index="03" title="Owners & ops notes" note="Planner owners can edit sessions; seeder notes below.">
            <div className="aled-stack">
              <div className="aled-panel"><PlannerOwners owners={owners} assignable={assignable} canManage /></div>
              <div className="aled-panel">
                <p className="aled-panel-title">Ops notes</p>
                <ul className="aled-notes">
                  <li>Curriculum sessions are seeded by <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>node load/seed-planner.js</span>.</li>
                  <li>Re-seeding is idempotent — it updates, never duplicates.</li>
                  <li>Relaxation is enforced on both this form and the events API.</li>
                </ul>
              </div>
            </div>
          </WorkspaceSection>
        </div>
      </main>
    </AppShell>
  );
}
