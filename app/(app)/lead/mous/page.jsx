import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listMous } from "@/lib/mou";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { MouBoard } from "@/components/lead/MouBoard";

export const dynamic = "force-dynamic";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

export default async function Page() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent("/lead/mous")}`);
  const { user, profile, tenant, sql } = ctx;
  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");

  const mous = await listMous(sql, { tenantId: tenant.id });
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const canManage = can(me, "manage_mou").ok;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`Chapter · ${mous.length} MoU${mous.length === 1 ? "" : "s"}`}
          title="MoU database."
          desc="Every agreement the chapter holds — who it is with, when it ends, and the signed copy. Expiry is never a surprise again."
        />
        <MouBoard initialMous={mous} canManage={canManage} />
      </main>
    </AppShell>
  );
}
