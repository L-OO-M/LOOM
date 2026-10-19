import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listMous } from "@/lib/mou";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { MouBoard } from "@/components/lead/MouBoard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await getRequestContext();
  const { user, profile, tenant, sql } = ctx;

  const mous = await listMous(sql, { tenantId: tenant.id });
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const canManage = can(me, "manage_mou").ok;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`Chapter · ${mous.length} MoU${mous.length === 1 ? "" : "s"}`}
          title="MoU database."
          desc="The chapter's agreements, their expiry windows and their signed copies."
        />
        <MouBoard initialMous={mous} canManage={canManage} />
      </main>
    </AppShell>
  );
}
