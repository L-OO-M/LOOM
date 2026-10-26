import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { PLANNER_ENABLED } from "@/lib/feature-flags";
import { isAdmin } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { loadPlanner, loadPlannerOwners, loadAssignableLeads } from "@/lib/planner-data";
import { PlannerBoard } from "@/components/planner/PlannerBoard";
import { PlannerOwners } from "@/components/planner/PlannerOwners";

export const dynamic = "force-dynamic";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

export default async function LeadPlannerPage() {
  if (!PLANNER_ENABLED) notFound();
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/lead/planner");
  const { user, profile, tenant, sql } = ctx;
  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");
  if (!tenant?.id) redirect("/lead/overview");

  const data = await loadPlanner({ sql, tenantId: tenant.id });
  const owners = await loadPlannerOwners({ sql, tenantId: tenant.id });
  const assignable = profile.role === "dept_lead" ? [] : await loadAssignableLeads({ sql, tenantId: tenant.id });
  const canManage = isAdmin({ role: profile.role }) || profile.role === "vertical_lead";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker="Planner / the whole calendar"
          title="Run the shared society calendar."
          lede="All six wings in one place. See who owns what, and pass a departing holder's sessions to their successor in a single move."
          meta={`${data.weeks.length} weeks / ${data.sessions.length} sessions / ${data.events.length} events on the calendar`}
          tone="ledger"
          art="/events/event-talk.png"
          artAlt=""
          stats={[
            { value: data.weeks.length, label: "weeks mapped" },
            { value: data.sessions.length, label: "sessions" },
            { value: data.events.length, label: "events" },
            { value: owners.length, label: "session owners" }
          ]}
        />
        <WorkspaceSection
          index="01"
          title="Session ownership"
          note="Hand a departing holder's sessions to their successor. Leads can reassign within their scope."
        >
          <div className="mt-4 max-w-md"><PlannerOwners owners={owners} assignable={assignable} canManage={canManage} /></div>
        </WorkspaceSection>
        <WorkspaceSection
          index="02"
          title="Shared calendar"
          note="Every wing, week by week. Switch scope or filter by wing to plan around conflicts."
        >
          <PlannerBoard weeks={data.weeks} sessions={data.sessions} events={data.events} primaryDomain={profile?.primary_domain || null} today={today} defaultMode="all" />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
