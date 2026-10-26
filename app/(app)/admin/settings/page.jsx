import { redirect } from "next/navigation";
import { Building2, Globe, ShieldCheck } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import "../_components/admin-ledger.css";

export default async function AdminSettingsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/settings");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/settings");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM profiles WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AS students,
      (SELECT COUNT(*)::int FROM projects WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AS projects,
      (SELECT COUNT(*)::int FROM contests WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AS contests
  `;
  const domains = tenant ? await sql`SELECT * FROM tenant_domains WHERE tenant_id = ${tenant.id}` : [];

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`College / ${tenant?.status || "status unknown"} / ${domains.length} mapped domain${domains.length === 1 ? "" : "s"}`}
          title="Settings"
          lede="Tenant identity, access rules, and honest integration status — what this chapter owns and what's still offline."
          meta={`${tenant?.name || "—"} · ${tenant?.slug || "—"} / ${stats?.students ?? 0} profiles / ${stats?.projects ?? 0} projects / ${stats?.contests ?? 0} contests`}
          tone="paper"
          art="/domains-art/domain-infra.png"
          artAlt=""
          stats={[
            { value: stats?.students ?? 0, label: "profiles" },
            { value: stats?.projects ?? 0, label: "projects" },
            { value: stats?.contests ?? 0, label: "contests" }
          ]}
        />

        <WorkspaceSection index="01" title="Tenant identity" note="Host-based resolution maps domains to this chapter." action={<span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><Globe size={12} aria-hidden="true" /> {domains.length} domain{domains.length === 1 ? "" : "s"}</span>}>
          <div className="aled-panel">
            <p className="aled-panel-title"><Building2 size={14} aria-hidden="true" /> {tenant?.name || "—"} · {tenant?.slug || "—"}</p>
            <p className="aled-sub">
              Status: {tenant?.status || "—"} · ID: {tenant?.id?.slice(0, 8) || "—"}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.7rem" }}>
              {domains.length === 0 ? (
                <span className="aled-meta">No domains mapped — add one in tenant_domains to scope host-based tenant resolution.</span>
              ) : domains.map((d) => (
                <span key={d.domain} className="aled-tag">{d.domain}</span>
              ))}
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Integrations" note="Honest status — no green badges for services that are not configured." action={<ShieldCheck size={14} aria-hidden="true" style={{ color: "var(--text-muted)" }} />}>
          <ul className="aled-notes">
            <li>
              GitHub: username linking + webhooks received only while <span style={{ color: "var(--text)", fontWeight: 600 }}>Flags → github_integration</span> is on. {process.env.QSTASH_TOKEN ? "QStash configured — jobs via queue." : "QStash not configured — webhooks run inline."}
            </li>
            <li>Redis / R2 / Realtime: not configured — pages show real DB state with honest unavailable notes. Add UPSTASH / R2 envs to enable.</li>
            <li>Rollups: run nightly via cron (see docs/15). Until then, analytics snapshots may lag.</li>
          </ul>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
