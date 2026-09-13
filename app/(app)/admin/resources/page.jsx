import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { ResourceForm } from "@/components/admin-forms";

export default async function AdminResourcesPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/resources");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/resources");
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT * FROM resources ORDER BY domain ASC, minutes ASC LIMIT 200`;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Content" title="Resources" desc="Create and update the catalog students learn from." />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" style={{ color: "var(--text)" }}>{r.title}</span>
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{r.id} · {r.domain} · {r.level} · {r.minutes} min</span>
                </span>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "var(--accent)" }}>↗</a>}
              </div>
            ))}
          </div>
          <ResourceForm />
        </div>
      </main>
    </AppShell>
  );
}
