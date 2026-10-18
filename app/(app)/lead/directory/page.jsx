import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listDirectory } from "@/lib/directory";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { LeadDirectory } from "@/components/lead/LeadDirectory";

export const dynamic = "force-dynamic";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

export default async function Page() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent("/lead/directory")}`);
  const { user, profile, tenant, sql } = ctx;
  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");

  const departments = await sql`
    SELECT id, name FROM departments
    WHERE tenant_id = ${tenant.id}::uuid AND is_active
    ORDER BY name
  `;
  const entries = await listDirectory(sql, { tenantId: tenant.id });
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const canManage = can(me, "manage_leads").ok;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`Chapter · ${entries.length} ${entries.length === 1 ? "person" : "people"}`}
          title="Leadership directory."
          desc="Who leads what — current leads and the past holders still worth calling during a handover."
        />
        <LeadDirectory initialEntries={entries} departments={departments} canManage={canManage} />
      </main>
    </AppShell>
  );
}
