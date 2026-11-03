import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { listDirectory } from "@/lib/directory";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { LeadDirectory } from "@/components/lead/LeadDirectory";

export const dynamic = "force-dynamic";

export default async function AdminDirectoryPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/directory");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/directory");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/admin");

  const departments = await sql`
    SELECT id, name FROM departments
    WHERE tenant_id = ${tenant.id}::uuid AND is_active
    ORDER BY name
  `;
  const entries = await listDirectory(sql, { tenantId: tenant.id });
  const current = entries.filter((e) => e.is_current).length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Chapter / ${entries.length} ${entries.length === 1 ? "person" : "people"} / ${departments.length} departments`}
          title="Leadership directory."
          lede="Who leads what - current leads and the past holders still worth calling during a handover."
          meta="Admins can add and edit entries for this chapter."
          tone="field"
          art="/storyloom/mentorship.png"
          artAlt=""
          stats={[
            { value: entries.length, label: "people listed" },
            { value: current, label: "current holders" },
            { value: entries.length - current, label: "past holders" },
            { value: departments.length, label: "departments" }
          ]}
        />
        <WorkspaceSection
          index="01"
          title="The directory"
          note="Current leads first, then past holders. Filter by department or vertical to trace a handover."
        >
          <LeadDirectory initialEntries={entries} departments={departments} canManage />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
