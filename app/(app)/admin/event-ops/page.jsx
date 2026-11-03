import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { listTasks } from "@/lib/event-ops";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { EventOpsBoard } from "@/components/lead/EventOpsBoard";

export const dynamic = "force-dynamic";

export default async function AdminEventOpsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/event-ops");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/event-ops");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/admin");

  const events = await sql`
    SELECT id, title FROM events
    WHERE tenant_id = ${tenant.id}::uuid AND starts_at >= (NOW() - INTERVAL '90 days')
    ORDER BY starts_at DESC
    LIMIT 100
  `;
  const members = await sql`
    SELECT user_id, name FROM profiles
    WHERE tenant_id = ${tenant.id}::uuid
    ORDER BY name
    LIMIT 200
  `;
  const tasks = await listTasks(sql, { tenantId: tenant.id });
  const open = tasks.filter((t) => t.status !== "done").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const dueSoon = tasks.filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at).getTime() <= horizon).length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Operations / ${open} open / ${events.length} events`}
          title="Event operations."
          lede="Every chore that decides whether an event runs on time - owner, deadline, done. No more asking in chat who booked the hall."
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
        <WorkspaceSection index="01" title="Task board" note="Filter by event, owner, or status. Done tasks stay visible until archived.">
          <EventOpsBoard initialTasks={tasks} events={events} members={members} canManage />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
