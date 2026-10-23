import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { PLANNER_ENABLED } from "@/lib/feature-flags";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import { loadPlanner } from "@/lib/planner-data";
import { PlannerBoard } from "@/components/planner/PlannerBoard";
import { trackLabel } from "@/lib/planner";
import { LearnTabs } from "@/components/student/SectionRails";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  if (!PLANNER_ENABLED) notFound();
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/planner");
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student");

  const data = await loadPlanner({ sql, tenantId: tenant.id });
  const today = new Date().toISOString().slice(0, 10);
  const wing = profile?.primary_domain || null;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Meta>Learn &middot; your schedule, on the society&rsquo;s calendar</Meta>
        <Display size="lg" className="mt-3">
          {wing ? `Your ${trackLabel(wing)} weeks.` : "Your weeks, at a glance."}
        </Display>
        <p className="narrative mt-4 max-w-2xl">
          {wing
            ? "This opens on your own wing so it stays useful. When you want to see what else is running — or think about picking up a second domain — switch to Explore other wings. A protected relaxation window runs 20 Nov to 20 Dec 2026."
            : "Pick a domain in settings to focus this on your own wing. Until then it shows the full calendar, and you can still switch wings above. A protected relaxation window runs 20 Nov to 20 Dec 2026."}
        </p>

        <LearnTabs active="/student/planner" />

        <PlannerBoard
          weeks={data.weeks}
          sessions={data.sessions}
          events={data.events}
          primaryDomain={wing}
          today={today}
        />
      </main>
    </AppShell>
  );
}
