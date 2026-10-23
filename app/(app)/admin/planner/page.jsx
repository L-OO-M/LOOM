import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { PLANNER_ENABLED } from "@/lib/feature-flags";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { loadPlanner, loadPlannerOwners, loadAssignableLeads } from "@/lib/planner-data";
import { PLANNER_TRACKS, formatWeekRange, trackLabel } from "@/lib/planner";
import { PlannerAdminForm } from "./PlannerAdminBits";
import { PlannerOwners } from "@/components/planner/PlannerOwners";

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
        <PageHeader
          kicker={`Planner · ${data.academicYear}`}
          title="Collective master planner"
          desc="The single 28-week calendar across six wings. Sessions are seeded from the approved plan; society events are scheduled here and on the events console."
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Weeks", value: data.weeks.length },
            { label: "Curriculum sessions", value: data.sessions.length },
            { label: "Live sessions", value: live },
            { label: "Deferred / async", value: `${deferred} / ${asyncPacks}` },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p>
              <p className="meta">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="flex items-center justify-between gap-2">
              <Meta>Weeks 01–28</Meta>
              <Link href="/admin/events" prefetch={false} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>
                Events console
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {perWeek.map((w) => (
                <li key={w.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold" style={{ color: "var(--text)" }}>W{String(w.week_number).padStart(2, "0")}</span>
                    <span className="meta">{formatWeekRange(w)}</span>
                    <span className="pill">{w.delivery_mode}</span>
                    {w.is_relaxation ? <span className="pill">Relaxation</span> : null}
                    {w.is_protected ? <span className="pill">Exam protection</span> : null}
                  </div>
                  <p className="mt-1.5 text-sm font-medium" style={{ color: "var(--text)" }}>{w.theme}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PLANNER_TRACKS.map((t) => {
                      const n = w.sessions.filter((s) => s.track_domain === t.key).length;
                      if (!n) return null;
                      return <span key={t.key} className="meta">{trackLabel(t.key)} {n}</span>;
                    })}
                    {w.events.length ? <span className="meta">Society {w.events.length}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-4">
            <PlannerOwners owners={owners} assignable={assignable} canManage />
            <div className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Schedule a society event</h2>
              <p className="narrative mt-1">Linked to a planner week and blocked inside the 20 Nov–20 Dec relaxation window.</p>
              <div className="mt-4"><PlannerAdminForm weeks={data.weeks} /></div>
            </div>
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Ops notes</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                <li>Curriculum sessions are seeded by <span className="font-mono">node load/seed-planner.js</span>.</li>
                <li>Re-seeding is idempotent — it updates, never duplicates.</li>
                <li>Relaxation is enforced on both this form and the events API.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
