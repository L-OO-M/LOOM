import { redirect } from "next/navigation";
import { Building2, Users, FolderGit2, Trophy, Globe, ShieldCheck } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";

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
        <PageHeader kicker="College" title="Settings" desc="Tenant identity, access rules, and honest integration status — what this chapter owns and what's still offline." />

        <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Building2 size={14} /> {tenant?.name || "—"} · {tenant?.slug || "—"}</h2>
              <p className="meta mt-1">Status: {tenant?.status || "—"} · ID: {tenant?.id?.slice(0, 8) || "—"}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><Globe size={12} /> {domains.length} domain{domains.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {domains.length === 0 ? <span className="meta">No domains mapped — add one in tenant_domains to scope host-based tenant resolution.</span> : domains.map((d) => (
              <span key={d.domain} className="inline-flex rounded-full border px-2.5 py-1 font-mono text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>{d.domain}</span>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Students", value: stats?.students ?? 0, icon: Users },
            { label: "Projects", value: stats?.projects ?? 0, icon: FolderGit2 },
            { label: "Contests", value: stats?.contests ?? 0, icon: Trophy },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label}</p></div>
            </div>
          ))}
        </div>

        <section className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><ShieldCheck size={14} /> Integrations · honest status</h2>
          <ul className="mt-3 space-y-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
            <li className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: "var(--line)" }} /> GitHub: username linking + webhooks received only while <span className="font-medium" style={{ color: "var(--text)" }}>Flags → github_integration</span> is on. {process.env.QSTASH_TOKEN ? "QStash configured — jobs via queue." : "QStash not configured — webhooks run inline."}</li>
            <li className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: "var(--line)" }} /> Redis / R2 / Realtime: not configured — pages show real DB state with honest unavailable notes. Add UPSTASH / R2 envs to enable.</li>
            <li className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: "var(--line)" }} /> Rollups: run nightly via cron (see docs/15). Until then, analytics snapshots may lag.</li>
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
