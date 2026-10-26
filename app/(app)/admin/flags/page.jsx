import { redirect } from "next/navigation";
import { ToggleRight, Shield } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { FlagToggle } from "@/components/admin-forms";
import "../_components/admin-ledger.css";

const FLAG_META = {
  github_integration: { title: "GitHub integration", desc: "When off, webhooks are acked but not stored or scored. Paused by default." },
  ranking_verified: { title: "Verified standings", desc: "Score only evidence a GitHub delivery or a lead confirmed. OFF means the older board, which counted nodes and projects a student declared themselves. Turning this on withdraws points they were shown as earned." },
  community_wiki: { title: "Community wiki", desc: "Controls wiki visibility for this chapter." },
  zen_mode: { title: "Zen Learning Mode", desc: "When off, study resources open natively in a new tab and the distraction-free overlay never mounts. Off by default." },
};

// Global security controls. Read-only here on purpose -- see the comment in
// app/api/admin/flags/route.js. "Chapter-scoped" is wrong for these.
const OPERATOR_ONLY = {
  tenant_rls_enforced: {
    title: "Tenant RLS enforcement",
    desc: "Global database-level tenant isolation. Operator-only: change it in SQL after running node load/verify-rls.js. Not chapter-scoped.",
  },
};

export default async function AdminFlagsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/flags");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/flags");
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT * FROM feature_flags WHERE tenant_id = ${tenant?.id} ORDER BY key ASC`;
  const enabled = rows.filter((f) => f.enabled).length;
  const operatorOnly = rows.filter((f) => OPERATOR_ONLY[f.key]).length;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Control / ${rows.length} flags / this chapter`}
          title="Feature flags"
          lede="Toggles persist to this chapter and are audit-logged. Flip carefully — each change writes to the audit trail."
          meta={`${enabled} on / ${rows.length - enabled} off / ${operatorOnly} operator-only`}
          tone="ledger"
          stats={[
            { value: rows.length, label: "flags for this chapter" },
            { value: enabled, label: "currently on" },
            { value: rows.length - enabled, label: "currently off" },
            { value: operatorOnly, label: "operator-only" }
          ]}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "1.1rem", padding: "0.6rem 0.75rem", border: "1px solid var(--line)", background: "color-mix(in srgb, var(--bg-elevated) 70%, transparent)" }}>
          <Shield size={12} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <span className="aled-meta">Chapter toggles are immediate and scoped to this college. Global security controls are operator-only.</span>
        </div>

        <WorkspaceSection index="01" title="Chapter controls" note="Each flag is keyed to this chapter. Operator-only controls stay read-only here.">
          {rows.length === 0 ? (
            <WorkspaceEmpty
              title="No flags for this college"
              body="Seed the control plane with node load/seed-control-plane.js."
            />
          ) : (
            <div style={{ marginTop: "0.9rem", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
              {rows.map((f) => {
                const locked = OPERATOR_ONLY[f.key];
                const meta = locked || FLAG_META[f.key] || { title: f.key.replaceAll("_", " "), desc: "Chapter-scoped toggle." };
                return (
                  <div key={f.key} className="aled-flag-row">
                    <span style={{ minWidth: 0 }}>
                      <span className="aled-title" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <ToggleRight size={14} style={{ color: f.enabled ? "var(--accent)" : "var(--text-muted)" }} aria-hidden="true" /> {meta.title}
                      </span>
                      <p className="aled-sub">{meta.desc}</p>
                      <p className="aled-meta" style={{ marginTop: "0.25rem" }}>{f.key}</p>
                    </span>
                    <span className="aled-flag-state">
                      <span className={`aled-tag ${f.enabled ? "aled-tag--success" : ""}`}>{f.enabled ? "On" : "Off"}</span>
                      {locked ? (
                        <span className="aled-tag">Operator-only</span>
                      ) : (
                        <FlagToggle flagKey={f.key} enabled={f.enabled} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
