import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { DOMAIN_LABEL, DOMAIN_ORDER } from "@/lib/domains";
import { EventForm } from "@/components/admin/EventForm";
import { termExpired } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

export default async function LeadEventNewPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent("/lead/events/new")}`);
  const { user, profile, tenant, sql } = ctx;

  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");

  // Load departments for the department picker (dept leads see only their departments)
  const departments = await sql`
    SELECT id, name, vertical FROM departments
    WHERE tenant_id = ${tenant.id}::uuid
    ORDER BY name
    LIMIT 100
  `;

  // Filter departments based on role
  let visibleDepartments = departments;
  if (profile.role === "dept_lead") {
    const myDeptIds = (profile.memberships || [])
      .filter((membership) =>
        membership.level === "dept_lead" && !termExpired(membership.term_end)
      )
      .map((m) => m.department_id);
    if (myDeptIds.length === 0) redirect("/student");
    visibleDepartments = departments.filter((d) => myDeptIds.includes(d.id));
  } else if (profile.role === "vertical_lead") {
    visibleDepartments = departments.filter((d) => d.vertical === profile.vertical);
  }

  const domains = DOMAIN_ORDER.map((key) => ({ key, label: DOMAIN_LABEL[key] }));

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker="Gather"
          title="Create an event"
          lede="Schedule a workshop, hackathon, talk, mentoring session, or contest. Fill every field once — students see it all on the event page."
          meta="Department leads publish to their department; Vertical leads and admins can publish society-wide."
          tone="field"
          art="/events/event-workshop.png"
          artAlt=""
        />

        <WorkspaceSection title="Event details" note="All fields are stored and displayed on the public event page.">
          <EventForm
            domains={domains}
            departments={visibleDepartments}
            redirectTo="/lead/events/{id}"
          />
        </WorkspaceSection>

        <WorkspaceSection index="02" title="What happens after you post">
          <ul className="mt-3 space-y-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <li>• Department events go live immediately for your department members.</li>
            <li>• Society-wide events from department leads enter the <strong>proposed</strong> queue for Vertical Lead approval.</li>
            <li>• Vertical leads and admins can publish society-wide events directly.</li>
            <li>• You can edit any field later from the event&apos;s workspace page (<kbd>{'/lead/events/{id}'}</kbd>).</li>
            <li>• Past events can be created by setting the start date in the past and status to <strong>Completed</strong>.</li>
          </ul>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
