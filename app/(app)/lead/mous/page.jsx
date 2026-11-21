import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { listMous, listRenewals, MOU_EXPIRING_DAYS } from "@/lib/mou";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { MouBoard } from "@/components/lead/MouBoard";
import { ownedVerticals } from "@/lib/scope";

export const dynamic = "force-dynamic";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

export default async function Page() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent("/lead/mous")}`);
  const { user, profile, tenant, sql } = ctx;
  if (!LEAD_ROLES.includes(profile.role)) redirect("/student");

  const owned = ownedVerticals({ ...profile, tenantId: tenant.id });
  // A vertical lead only sees a currently granted vertical. A stale role label
  // without an active scoped grant has no lead-console authority.
  if (profile.role === "vertical_lead" && !owned.all && owned.size === 0) redirect("/student");
  const verticalScope = profile.role === "vertical_lead" && !owned.all && owned.size === 1
    ? { vertical: [...owned][0] }
    : {};
  const mous = await listMous(sql, { tenantId: tenant.id, ...verticalScope });
  const renewals = await listRenewals(sql, { tenantId: tenant.id, ...verticalScope });
  const sponsorRows = await sql`
    SELECT id, name, vertical, status, amount
    FROM sponsorships
    WHERE tenant_id = ${tenant.id}::uuid
    ORDER BY name
    LIMIT 200
  `;
  const sponsors = sponsorRows.filter((s) => owned.all || (s.vertical && owned.has(s.vertical)));
  const me = {
    id: user.id,
    tenantId: tenant.id,
    role: profile.role,
    vertical: profile.vertical,
    memberships: profile.memberships || [],
    scopedGrants: profile.scopedGrants || []
  };
  const canManage = can(me, "manage_mou", verticalScope).ok;
  const active = mous.filter((m) => m.status === "active").length;
  const horizon = Date.now() + MOU_EXPIRING_DAYS * 24 * 60 * 60 * 1000;
  const expiring = mous.filter((m) => m.status === "active" && m.ends_on && new Date(m.ends_on).getTime() <= horizon).length;
  const documents = mous.reduce((n, m) => n + (m.document_count || 0), 0);

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Chapter / ${mous.length} MoU${mous.length === 1 ? "" : "s"} / ${active} active`}
          title="MoU database."
          lede="Every agreement the chapter holds — who it is with, when it ends, and the signed copy. Expiry is never a surprise again."
          meta={`${expiring} expiring within ${MOU_EXPIRING_DAYS} days / ${renewals.length} open renewal task${renewals.length === 1 ? "" : "s"}`}
          tone="ledger"
          art="/storyloom/opportunity.png"
          artAlt=""
          stats={[
            { value: mous.length, label: "agreements logged" },
            { value: active, label: "active now" },
            { value: expiring, label: `expiring in ${MOU_EXPIRING_DAYS}d` },
            { value: documents, label: "signed documents" }
          ]}
        />
        <WorkspaceSection
          index="01"
          title="Agreement ledger"
          note={`Filter by status or partner type. Active agreements ending within ${MOU_EXPIRING_DAYS} days surface first.`}
        >
          <MouBoard initialMous={mous} initialRenewals={renewals} sponsors={sponsors} expiringDays={MOU_EXPIRING_DAYS} canManage={canManage} />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
