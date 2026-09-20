import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { getSql } from "@/lib/db";
import { getLeadOverview } from "@/lib/lead";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { LeadConsoleTabs } from "./_components/LeadConsoleTabs";

export default async function LeadConsolePage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/lead");
  const { user, profile, tenant } = ctx;
  if (!["dept_lead", "vertical_lead", "admin"].includes(profile.role)) redirect("/student");
  const sql = getSql();
  const data = await getLeadOverview(sql, { userId: user.id, profile, tenant });
  const isVertical = data.role === "vertical_lead" || data.role === "admin";
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

        <LeadConsoleTabs initialData={data} userId={user.id} isVertical={isVertical} />
      </main>
    </AppShell>
  );
}
