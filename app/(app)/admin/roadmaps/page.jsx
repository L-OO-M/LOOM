import { redirect } from "next/navigation";
import Link from "next/link";
import { Layers, GraduationCap, Users, Search, ListOrdered, BookOpen, TrendingUp } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { NodeForm } from "@/components/admin-forms";

export default async function AdminRoadmapsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/roadmaps");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/roadmaps");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const domain = sp?.domain || "";

  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM roadmap_nodes) AS nodes,
      (SELECT COUNT(DISTINCT domain)::int FROM roadmap_nodes) AS domains,
      (SELECT COUNT(*)::int FROM student_roadmap_progress p JOIN profiles pr ON pr.user_id = p.student_id WHERE p.status = 'completed' AND (pr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS completions,
      (SELECT COUNT(*)::int FROM profiles WHERE role = 'student' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS students
  `;

  const domains = await sql`SELECT DISTINCT domain FROM roadmap_nodes ORDER BY domain`;
  const nodes = await sql`
    SELECT n.*,
      (SELECT COUNT(*)::int FROM student_roadmap_progress p JOIN profiles pr ON pr.user_id = p.student_id WHERE p.node_id = n.id AND p.status = 'completed' AND (pr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS completions,
      (SELECT COUNT(*)::int FROM resources r WHERE r.domain = n.domain) AS resources
    FROM roadmap_nodes n
    WHERE (${q ? sql`(n.title ILIKE ${"%" + q + "%"} OR n.description ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${domain ? sql`n.domain = ${domain}` : sql`TRUE`})
    ORDER BY n.sort_order ASC, n.title ASC
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader
          kicker={`Content · ${stats?.nodes ?? 0} nodes · ${stats?.domains ?? 0} domains · ${stats?.completions ?? 0} completions in chapter`}
          title="Roadmaps"
          desc="Global catalog — curated learning nodes. Completions below are counted for this chapter only. Drag order via sort_order."
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Nodes", value: stats?.nodes ?? 0, icon: Layers, sub: "global catalog" },
            { label: "Domains", value: stats?.domains ?? 0, icon: BookOpen, sub: "tracks" },
            { label: "Completions", value: stats?.completions ?? 0, icon: TrendingUp, sub: "this chapter" },
            { label: "Students", value: stats?.students ?? 0, icon: Users, sub: "enrolled" },
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
            <input name="q" defaultValue={q} placeholder="Search title or description…" className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }} />
          </div>
          <select name="domain" defaultValue={domain} className="rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="">All domains</option>
            {domains.map((d) => <option key={d.domain} value={d.domain}>{d.domain}</option>)}
          </select>
          <button className="btn-ink !py-2.5 text-sm">Filter</button>
          {(q || domain) && <Link href="/admin/roadmaps" prefetch={false} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="meta ml-auto hidden sm:block">{nodes.length} shown</span>
        </form>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="flex items-center gap-2">
              <ListOrdered size={14} style={{ color: "var(--text-muted)" }} />
              <Meta>Nodes · ordered by sort_order</Meta>
              <span className="meta ml-auto">{nodes.length} total</span>
            </div>

            {nodes.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No nodes match</p>
                <p className="narrative mx-auto mt-2 max-w-md">Try clearing the domain filter or add the first node on the right.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {nodes.map((n, i) => {
                  const pct = stats?.students ? Math.round((n.completions / stats.students) * 100) : 0;
                  return (
                    <li key={n.id} className="group flex items-start gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{n.title}</span>
                          <span className="inline-flex rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>{n.domain}</span>
                          <span className="meta">· #{n.sort_order}</span>
                          {n.difficulty_level && <span className="inline-flex rounded-full border px-2 py-0.5 text-xs capitalize" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{n.difficulty_level}</span>}
                        </div>
                        {n.description && <p className="narrative mt-1 line-clamp-2 text-xs leading-5">{n.description}</p>}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 max-w-[160px] overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: "var(--accent)" }} />
                          </div>
                          <span className="meta">{n.completions} completions · {pct}% of chapter · {n.resources ?? 0} resources</span>
                        </div>
                        <p className="meta mt-1 font-mono text-[11px]">{n.id}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            <NodeForm />
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text)" }}><GraduationCap size={12} /> How roadmaps work</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                <li>· Global catalog — every chapter sees the same nodes.</li>
                <li>· Completions are per-chapter (this page counts only your students).</li>
                <li>· sort_order controls the student journey.</li>
                <li>· Editing a node updates its domain and order live.</li>
              </ul>
              <Link href="/admin/resources" prefetch={false} className="mt-3 inline-flex text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Manage resources →</Link>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
