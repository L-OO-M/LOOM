import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listDirectory } from "@/lib/directory";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { LeadDirectory } from "@/components/lead/LeadDirectory";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await getRequestContext();
  const { user, profile, tenant, sql } = ctx;

  const departments = await sql`
    SELECT id, name FROM departments
    WHERE tenant_id = ${tenant.id}::uuid AND is_active
    ORDER BY name
  `;
  const entries = await listDirectory(sql, { tenantId: tenant.id });
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const canManage = can(me, "manage_leads").ok;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`Chapter · ${entries.length} ${entries.length === 1 ? "person" : "people"}`}
          title="Leadership directory."
          desc="The chapter's leads and heads, current and past."
        />
        <LeadDirectory initialEntries={entries} departments={departments} canManage={canManage} />
      </main>
    </AppShell>
  );
}
