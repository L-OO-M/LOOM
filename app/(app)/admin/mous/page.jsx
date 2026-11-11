import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { listMous, listRenewals, MOU_EXPIRING_DAYS } from "@/lib/mou";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { MouBoard } from "@/components/lead/MouBoard";
import { ownedVerticals } from "@/lib/scope";

export const dynamic = "force-dynamic";

export default async function AdminMousPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/mous");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/mous");
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/admin");

  const mous = await listMous(sql, { tenantId: tenant.id });
  const renewals = await listRenewals(sql, { tenantId: tenant.id });
  const owned = ownedVerticals(profile);
  const sponsorRows = await sql`
    SELECT id, name, vertical, status, amount
    FROM sponsorships
    WHERE tenant_id = ${tenant.id}::uuid
    ORDER BY name
    LIMIT 200
  `;
  const sponsors = sponsorRows.filter((s) => owned.all || (s.vertical && owned.has(s.vertical)));
  const active = mous.filter((m) => m.status === "active").length;
  const horizon = Date.now() + MOU_EXPIRING_DAYS * 24 * 60 * 60 * 1000;
  const expiring = mous.filter((m) => m.status === "active" && m.ends_on && new Date(m.ends_on).getTime() <= horizon).length;
  const documents = mous.reduce((n, m) => n + (m.document_count || 0), 0);

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Chapter / ${mous.length} MoU${mous.length === 1 ? "" : "s"} / ${active} active`}
          title="MoU database."
          lede="Every agreement the chapter holds - who it is with, when it ends, and the signed copy. Expiry is never a surprise."
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
          <MouBoard initialMous={mous} initialRenewals={renewals} sponsors={sponsors} expiringDays={MOU_EXPIRING_DAYS} canManage />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
