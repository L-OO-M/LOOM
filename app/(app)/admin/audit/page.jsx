import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";

export default async function AdminAuditPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/audit");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/audit");
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Operations" title="Audit log" desc="Who changed what. Secrets and tokens are never logged." />
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)" }}>
          {rows.map((e) => (
            <div key={e.id} className="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[180px_1fr_1fr_auto]" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{new Date(e.created_at).toLocaleString("en-IN")}</span>
              <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{e.action.replaceAll("_", " ")}</span>
              <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{e.actor_id} → {e.resource}/{e.resource_id}</span>
              <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{e.metadata?.tenant_id ? "tenant-scoped" : ""}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>No audit events yet.</p>}
        </div>
      </main>
    </AppShell>
  );
}
