import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { listAssets, listCategories } from "@/lib/assets";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { AssetLibrary } from "@/components/lead/AssetLibrary";

export const dynamic = "force-dynamic";

export default async function AdminAssetsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/assets");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/assets");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/admin");

  const categories = await listCategories(sql, tenant.id);
  const assets = await listAssets(sql, { tenantId: tenant.id });
  const kinds = new Set(assets.map((a) => a.kind)).size;
  const recent = assets.filter((a) => a.created_at && Date.now() - new Date(a.created_at).getTime() <= 30 * 24 * 60 * 60 * 1000).length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Chapter / ${assets.length} asset${assets.length === 1 ? "" : "s"} / ${categories.length} categories`}
          title="Creative assets."
          lede="The chapter's shared shelf of logos, signatures, templates, and decks - one private place instead of a chat scroll."
          meta={`${kinds} file kind${kinds === 1 ? "" : "s"} / admins manage the shelf`}
          tone="ledger"
          art="/domains-art/domain-creative.png"
          artAlt=""
          stats={[
            { value: assets.length, label: "assets on the shelf" },
            { value: categories.length, label: "categories" },
            { value: kinds, label: "file kinds" },
            { value: recent, label: "added in 30d" }
          ]}
        />
        <WorkspaceSection index="01" title="The shelf" note="Filter by category or kind, then download, preview, or add a new version. Everything stays inside the chapter.">
          <AssetLibrary initialAssets={assets} categories={categories} canManage />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
