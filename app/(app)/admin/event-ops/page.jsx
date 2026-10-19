import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listTasks } from "@/lib/event-ops";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { EventOpsBoard } from "@/components/lead/EventOpsBoard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await getRequestContext();
  const { user, profile, tenant, sql } = ctx;

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
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const canManage = can(me, "manage_event_ops").ok;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`Operations · ${tasks.filter((t) => t.status !== "done").length} open`}
          title="Event operations."
          desc="Tasks and deadlines that keep events running on time."
        />
        <EventOpsBoard initialTasks={tasks} events={events} members={members} canManage={canManage} />
      </main>
    </AppShell>
  );
}
