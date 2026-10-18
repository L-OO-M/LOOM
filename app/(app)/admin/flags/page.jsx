import { redirect } from "next/navigation";
import { ToggleRight, Shield } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { FlagToggle } from "@/components/admin-forms";

const FLAG_META = {
  github_integration: { title: "GitHub integration", desc: "When off, webhooks are acked but not stored or scored. Paused by default." },
  ranking_verified: { title: "Verified standings", desc: "Score only evidence a GitHub delivery or a lead confirmed. OFF means the older board, which counted nodes and projects a student declared themselves. Turning this on withdraws points they were shown as earned." },
  community_wiki: { title: "Community wiki", desc: "Controls wiki visibility for this chapter." },
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
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Control · ${rows.length} flags · this chapter`} title="Feature flags" desc="Toggles persist to this chapter and are audit-logged. Flip carefully — each change writes to the audit trail." />
        <div className="mb-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <Shield size={12} /> Chapter toggles are immediate and scoped to this college. Global security controls below are operator-only.
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="narrative">No flags for this college. Seed the control plane with <span className="font-mono">node load/seed-control-plane.js</span>.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((f) => {
              const operatorOnly = OPERATOR_ONLY[f.key];
              const meta = operatorOnly || FLAG_META[f.key] || { title: f.key.replaceAll("_", " "), desc: "Chapter-scoped toggle." };
              return (
                <li key={f.key} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: f.enabled ? "color-mix(in srgb, var(--accent) 18%, var(--line))" : "var(--line)", background: f.enabled ? "color-mix(in srgb, var(--accent) 4%, var(--bg-elevated))" : "var(--bg-elevated)" }}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text)" }}><ToggleRight size={14} style={{ color: f.enabled ? "var(--accent)" : "var(--text-muted)" }} /> {meta.title}</span>
                    <span className="meta mt-0.5 block">{meta.desc}</span>
                    <span className="meta font-mono text-[11px]">{f.key}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="meta hidden sm:block">{f.enabled ? "On" : "Off"}</span>
                    {operatorOnly ? (
                      <span className="meta rounded-lg border px-2 py-1" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Operator-only</span>
                    ) : (
                      <FlagToggle flagKey={f.key} enabled={f.enabled} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
