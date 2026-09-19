import { redirect } from "next/navigation";
import Link from "next/link";
import { FolderGit2, Users, Star, Clock3, Search, ArrowUpRight, ExternalLink, Layers } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";

export default async function AdminProjectsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/projects");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/projects");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const status = sp?.status || "";
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active,
           COUNT(DISTINCT owner_id)::int AS builders
    FROM projects WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL
  `;

  const rows = await sql`
    SELECT pr.*, p.name AS owner_name, p.github_username, n.title AS node_title
    FROM projects pr
    LEFT JOIN profiles p ON p.user_id = pr.owner_id
    LEFT JOIN roadmap_nodes n ON n.id = pr.roadmap_node_id
    WHERE (pr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND (${q ? sql`(pr.title ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${status ? sql`pr.status = ${status}` : sql`TRUE`})
    ORDER BY pr.created_at DESC LIMIT 50
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Build · ${stats?.total ?? 0} projects · ${stats?.builders ?? 0} builders`} title="Projects" desc="Review student work — every project links to its owner, roadmap node, and repo." />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Projects", value: stats?.total ?? 0, icon: FolderGit2, sub: "all" },
            { label: "Active", value: stats?.active ?? 0, icon: Star, sub: "shipped" },
            { label: "Builders", value: stats?.builders ?? 0, icon: Users, sub: "unique owners" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <form method="get" className="mb-4 flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="search">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input name="q" defaultValue={q} placeholder="Search title or owner…" className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }} />
          </div>
          <select name="status" defaultValue={status} className="rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <button className="btn-ink !py-2.5 text-sm">Filter</button>
          {(q || status) && <Link href="/admin/projects" prefetch={false} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="meta ml-auto hidden sm:block">{rows.length} shown · cap 50</span>
        </form>

        {rows.length === 0 ? (
          <EmptyState title="No projects" body="Student projects appear here once created from the Build workspace. Encourage shipping — projects fuel the leaderboard and proof." />
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.id} className="group flex flex-col gap-2 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{p.title}</span>
                    <span className="inline-flex rounded-full border px-2 py-0.5 text-xs capitalize" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>{p.status}</span>
                    {p.node_title && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><Layers size={10} /> {p.node_title}</span>}
                  </div>
                  <p className="meta mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1">{p.owner_name || p.owner_id.slice(0, 8)} {p.github_username ? `· @${p.github_username}` : ""}</span>
                    <span>· {new Date(p.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                    <span className="font-mono text-[11px]">{p.id.slice(0, 8)}</span>
                  </p>
                  {p.description && <p className="narrative mt-1 line-clamp-1 text-xs leading-5">{p.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.repo_url && <a href={p.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:border-[var(--accent)]" style={{ borderColor: "var(--line)", color: "var(--accent)" }}><ExternalLink size={12} /> Repo</a>}
                  <Link href={`/student/projects/${p.id}`} prefetch={false} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition group-hover:border-[var(--accent)]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--accent)" }}>
                    Review <ArrowUpRight size={12} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
