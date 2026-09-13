import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { NodeForm } from "@/components/admin-forms";

export default async function AdminRoadmapsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/roadmaps");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/roadmaps");
  const { user, tenant, sql } = ctx;
  const nodes = await sql`SELECT n.*, (SELECT COUNT(*)::int FROM student_roadmap_progress p WHERE p.node_id = n.id AND p.status = 'completed') AS completions FROM roadmap_nodes n ORDER BY sort_order ASC`;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Content" title="Roadmaps" desc="Nodes are global catalog; completions counted across your college." />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            {nodes.map((n, i) => (
              <div key={n.id} className="flex items-center gap-3 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold" style={{ background: "var(--bg-muted)", color: "var(--text-muted)" }}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" style={{ color: "var(--text)" }}>{n.title} <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{n.id}</span></span>
                  <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>{n.domain} · order {n.sort_order} · {n.completions} completions</span>
                </span>
              </div>
            ))}
          </div>
          <NodeForm />
        </div>
      </main>
    </AppShell>
  );
}
