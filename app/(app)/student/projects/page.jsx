import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState, PrimaryLink } from "@/components/ui";

export default async function ProjectsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/projects");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const tag = (sp?.tag || "").trim().toLowerCase();

  const rows = await sql`SELECT * FROM projects WHERE owner_id = ${user.id} ORDER BY created_at DESC LIMIT 50`;
  const allTags = [...new Set(rows.flatMap((p) => p.tags || []))].sort();
  const visible = tag ? rows.filter((p) => (p.tags || []).includes(tag)) : rows;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Build" title="Projects" desc="Real projects linked to roadmap nodes and repositories." action={<PrimaryLink href="/student/projects/new">New project</PrimaryLink>} />
        {allTags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            <Link href="/student/projects" className={!tag ? "btn-ink !px-3 !py-1 !text-xs" : "rounded-xl border px-3 py-1 text-xs"} style={tag ? { borderColor: "var(--line)", color: "var(--text-muted)" } : undefined}>All</Link>
            {allTags.map((t) => (
              <Link key={t} href={`/student/projects?tag=${encodeURIComponent(t)}`}
                className={tag === t ? "btn-ink !px-3 !py-1 !text-xs" : "rounded-xl border px-3 py-1 text-xs"}
                style={tag === t ? undefined : { borderColor: "var(--line)", color: "var(--text-muted)" }}>#{t}</Link>
            ))}
          </div>
        )}
        {visible.length === 0 ? (
          <EmptyState title={tag ? `No projects tagged #${tag}` : "No projects yet"} body={tag ? "" : "Create your first project. It will be stored in your college workspace and visible to admins."} action={<PrimaryLink href="/student/projects/new">Create project</PrimaryLink>} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <Link key={p.id} href={`/student/projects/${p.id}`} className="rounded-xl border p-5 transition hover:opacity-85" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{p.title}</p>
                <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>{p.description || "No description"}</p>
                {(p.tags || []).length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {(p.tags || []).map((t) => <span key={t} className="rounded-full border px-2 py-0.5 font-mono text-[11px]" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>#{t}</span>)}
                  </p>
                )}
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>{p.status} {p.repo_url ? "· repo linked" : ""}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
