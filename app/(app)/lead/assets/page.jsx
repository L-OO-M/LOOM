import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listAssets, listCategories } from "@/lib/assets";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { AssetLibrary } from "@/components/lead/AssetLibrary";

export const dynamic = "force-dynamic";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

export default async function Page() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent("/lead/assets")}`);
  const { user, profile, tenant, sql } = ctx;
  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");

  const categories = await listCategories(sql, tenant.id);
  const assets = await listAssets(sql, { tenantId: tenant.id });
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const canManage = can(me, "manage_assets").ok;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`Chapter · ${assets.length} asset${assets.length === 1 ? "" : "s"}`}
          title="Creative asset library."
          desc="Logos, signatures, templates and decks the chapter reuses — one private shelf, no more hunting through chat."
        />
        <AssetLibrary initialAssets={assets} categories={categories} canManage={canManage} />
      </main>
    </AppShell>
  );
}
