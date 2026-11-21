import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listTasks } from "@/lib/event-ops";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { EventOpsBoard } from "@/components/lead/EventOpsBoard";
import { ownedVerticals } from "@/lib/scope";

export const dynamic = "force-dynamic";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

export default async function Page({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent("/lead/event-ops")}`);
  const { user, profile, tenant, sql } = ctx;
  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");
  const sp = await searchParams;
  // Deep link from an event workspace: open the board already filtered to it.
  const initialEvent = typeof sp?.event === "string" ? sp.event : "";

  const owned = ownedVerticals({ ...profile, tenantId: tenant.id });
  const eventRows = await sql`
    SELECT e.id, e.title, d.vertical
    FROM events e
    LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = e.tenant_id
    WHERE e.tenant_id = ${tenant.id}::uuid AND e.starts_at >= (NOW() - INTERVAL '90 days')
    ORDER BY e.starts_at DESC
    LIMIT 100
  `;
  const events = owned.all
    ? eventRows
    : eventRows.filter((event) => event.vertical && owned.has(event.vertical));
  const members = await sql`
    SELECT user_id, name FROM profiles
    WHERE tenant_id = ${tenant.id}::uuid
    ORDER BY name
    LIMIT 200
  `;
  const taskRows = await listTasks(sql, { tenantId: tenant.id, eventId: initialEvent || null });
  const tasks = owned.all
    ? taskRows
    : taskRows.filter((task) =>
        task.owner_id === user.id ||
        task.created_by === user.id ||
        (task.event_vertical && owned.has(task.event_vertical))
      );
  const me = {
    id: user.id,
    tenantId: tenant.id,
    role: profile.role,
    vertical: profile.vertical,
    memberships: profile.memberships || [],
    scopedGrants: profile.scopedGrants || [],
    roleTermEnd: profile.roleTermEnd ?? profile.role_term_end ?? null
  };
  const canManage = can(me, "manage_event_ops").ok;
  const open = tasks.filter((t) => t.status !== "done").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const dueSoon = tasks.filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at).getTime() <= horizon).length;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Operations / ${open} open / ${events.length} events`}
          title="Event operations."
          lede="Every chore that decides whether an event runs on time — owner, deadline, done. No more asking in chat who booked the hall."
          meta={`${tasks.length} task${tasks.length === 1 ? "" : "s"} on the board / ${members.length} people available to own one`}
          tone="ledger"
          art="/events/event-workshop.png"
          artAlt=""
          stats={[
            { value: open, label: "still open" },
            { value: dueSoon, label: "due in 7d" },
            { value: done, label: "done" },
            { value: events.length, label: "events in scope" }
          ]}
        />
        <WorkspaceSection
          index="01"
          title="Task board"
          note="Filter by event, owner, or status. Done tasks stay visible until archived."
        >
          <EventOpsBoard initialTasks={tasks} events={events} members={members} canManage={canManage} initialEvent={initialEvent} />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
