import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState } from "@/components/ui";

export default async function AdminProjectsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/projects");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/projects");
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT pr.*, p.name as owner_name FROM projects pr LEFT JOIN profiles p ON p.user_id = pr.owner_id WHERE pr.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL ORDER BY pr.created_at DESC LIMIT 50`;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Build" title="Projects" desc="Review student work. Open a project to see owner, node, and repo." />
        {rows.length === 0 ? <EmptyState title="No projects" body="Student projects appear here once created." /> : (
          <div className="space-y-2">
            {rows.map((p) => (
              <Link key={p.id} href={`/student/projects/${p.id}`} className="flex items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" style={{ color: "var(--text)" }}>{p.title}</span>
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{p.owner_name || p.owner_id} · {p.status}</span>
                </span>
                <span className="text-xs" style={{ color: "var(--accent)" }}>Review →</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
