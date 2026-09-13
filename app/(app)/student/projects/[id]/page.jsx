import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";

export default async function ProjectDetailPage({ params }) {
  const { id } = await params;
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=/student/projects/${id}`);
  const { user, profile, tenant, sql } = ctx;
  const [p] = await sql`SELECT * FROM projects WHERE id = ${id} LIMIT 1`;
  if (!p) notFound();
  if (profile.role !== "admin" && p.owner_id !== user.id) redirect("/student/projects");
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}><Link href="/student/projects" style={{ color: "var(--accent)" }}>← Projects</Link></p>
        <PageHeader kicker={p.status} title={p.title} desc={p.description || "No description"} />
        <div className="grid gap-4">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Repository</p>
            {p.repo_url ? <a href={p.repo_url} target="_blank" rel="noreferrer" className="mt-2 block text-sm" style={{ color: "var(--accent)" }}>{p.repo_url} ↗</a>
              : <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No repository linked. Edit via API <span className="font-mono">PATCH /api/projects/{p.id}</span>.</p>}
          </Card>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Meta</p>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Created {new Date(p.created_at).toLocaleString("en-IN")} {p.roadmap_node_id ? `· node ${p.roadmap_node_id}` : ""}</p>
            {(p.tags || []).length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {(p.tags || []).map((t) => <span key={t} className="rounded-full border px-2 py-0.5 font-mono text-[11px]" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>#{t}</span>)}
              </p>
            )}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
