import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { PLANNER_ENABLED } from "@/lib/feature-flags";
import { isAdmin } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
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
        <PageHeader
          kicker="Planner · the whole calendar"
          title="Run the shared society calendar."
          desc="All six wings in one place. See who owns what, and pass a departing holder's sessions to their successor in a single move."
        />
        <div className="mt-6 max-w-md"><PlannerOwners owners={owners} assignable={assignable} canManage={canManage} /></div>
        <PlannerBoard weeks={data.weeks} sessions={data.sessions} events={data.events} primaryDomain={profile?.primary_domain || null} today={today} defaultMode="all" />
      </main>
    </AppShell>
  );
}
