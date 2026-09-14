import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, StatusPill } from "@/components/loom/primitives";

export default async function ProjectDetailPage({ params }) {
  const { id } = await params;
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=/student/projects/${id}`);
  const { user, profile, tenant, sql } = ctx;
  const [p] = await sql`SELECT * FROM projects WHERE id = ${id} LIMIT 1`;
  if (!p) notFound();
  if (profile.role !== "admin" && p.owner_id !== user.id) redirect("/student/projects");
  const [node] = p.roadmap_node_id ? await sql`SELECT id, title FROM roadmap_nodes WHERE id = ${p.roadmap_node_id} LIMIT 1` : [null];

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link href="/student/projects" className="meta hover:underline" style={{ color: "var(--accent)" }}>← Projects</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusPill tone={p.status === "active" ? "live" : ""}>{p.status}</StatusPill>
          <span className="meta">started {new Date(p.created_at).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })}</span>
        </div>
        <Display size="lg" className="mt-3">{p.title}</Display>
        <p className="lede mt-4">{p.description || "No description yet — the work speaks first."}</p>

        {(p.tags || []).length > 0 && (
          <p className="mt-5 flex flex-wrap gap-2">
            {(p.tags || []).map((t) => (
              <Link key={t} href={`/student/projects?tag=${encodeURIComponent(t)}`} className="rounded-full border px-2.5 py-0.5 font-mono text-xs hover:underline" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>#{t}</Link>
            ))}
          </p>
        )}

        <div className="mt-8 border-y py-6" style={{ borderColor: "var(--line)" }}>
          <Meta>Repository</Meta>
          {p.repo_url ? (
            <a href={p.repo_url} target="_blank" rel="noreferrer" className="mt-2 block truncate font-mono text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>{p.repo_url} ↗</a>
          ) : (
            <p className="narrative mt-2">No repository linked yet. Linking the repo connects future commits to this project automatically.</p>
          )}
        </div>

        {node && (
          <p className="mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Grows from milestone: <Link href={`/student/roadmap/${node.id}`} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>{node.title}</Link>
          </p>
        )}
      </main>
    </AppShell>
  );
}
