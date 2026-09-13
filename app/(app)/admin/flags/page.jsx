import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { FlagToggle } from "@/components/admin-forms";

export default async function AdminFlagsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/flags");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/flags");
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT * FROM feature_flags WHERE tenant_id = ${tenant?.id} ORDER BY key ASC`;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Control" title="Feature flags" desc="Toggles persist to your college and are audit-logged." />
        <div className="space-y-2">
          {rows.map((f) => (
            <div key={f.key} className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{f.key.replaceAll("_", " ")}</span>
              <FlagToggle flagKey={f.key} enabled={f.enabled} />
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No flags for this college.</p>}
        </div>
      </main>
    </AppShell>
  );
}
