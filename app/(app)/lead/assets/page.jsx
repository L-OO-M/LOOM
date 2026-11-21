import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listAssets, listCategories } from "@/lib/assets";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
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

  // Where may this person file an asset? Admins file anywhere; a head files
  // into the departments they lead. With one department the route fills it in
  // for them, so the picker only appears when there is an actual choice.
  const ledIds = new Set(
    (profile.memberships || []).filter((m) => m.level === "dept_lead").map((m) => m.department_id)
  );
  const allDepartments = await sql`
    SELECT id, name FROM departments
    WHERE tenant_id = ${tenant.id}::uuid AND is_active
    ORDER BY vertical, name
  `;
  const filings = profile.role === "admin"
    ? allDepartments
    : allDepartments.filter((d) => ledIds.has(d.id));

  const kinds = new Set(assets.map((a) => a.kind)).size;
  const recent = assets.filter((a) => a.created_at && Date.now() - new Date(a.created_at).getTime() <= 30 * 24 * 60 * 60 * 1000).length;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Chapter / ${assets.length} asset${assets.length === 1 ? "" : "s"} / ${categories.length} categories`}
          title="Creative asset library."
          lede="Logos, signatures, templates and decks the chapter reuses — one private shelf, no more hunting through chat."
          meta={`${kinds} file kind${kinds === 1 ? "" : "s"} / managed by ${canManage ? "you and the lead tiers" : "your lead tiers"}`}
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
        <WorkspaceSection
          index="01"
          title="The shelf"
          note="Filter by category or kind, then download, preview, or add a new version. Everything here stays inside the chapter."
        >
          <AssetLibrary initialAssets={assets} categories={categories} departments={filings} canManage={canManage} />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
