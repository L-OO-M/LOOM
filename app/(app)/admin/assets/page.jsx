import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listAssets, listCategories } from "@/lib/assets";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { AssetLibrary } from "@/components/lead/AssetLibrary";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await getRequestContext();
  const { user, profile, tenant, sql } = ctx;

  const categories = await listCategories(sql, tenant.id);
  const assets = await listAssets(sql, { tenantId: tenant.id });
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const canManage = can(me, "manage_assets").ok;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PageHeader
          kicker={`Chapter · ${assets.length} asset${assets.length === 1 ? "" : "s"}`}
          title="Creative asset library."
          desc="The same shelf chapter leads use — logos, signatures, templates and decks in one private place."
        />
        <AssetLibrary initialAssets={assets} categories={categories} canManage={canManage} />
      </main>
    </AppShell>
  );
}
