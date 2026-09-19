import { redirect } from "next/navigation";
import Link from "next/link";
import { Github, Star, GitPullRequest, CheckCircle2, Clock3, ExternalLink, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { CurateForm, ReviewButtons } from "./AdminOss";

function diffTone(d) {
  const m = {
    beginner: { bg: "color-mix(in srgb, #16a34a 10%, var(--bg))", color: "#16a34a", label: "Beginner" },
    intermediate: { bg: "color-mix(in srgb, #f59e0b 12%, var(--bg))", color: "#b45309", label: "Intermediate" },
    advanced: { bg: "color-mix(in srgb, #ef4444 10%, var(--bg))", color: "#dc2626", label: "Advanced" },
  };
  return m[d] || { bg: "var(--bg-elevated)", color: "var(--text-muted)", border: "var(--line)", label: d || "—" };
}

export default async function AdminOpenSourcePage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/opensource");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/opensource");
  const { tenant, user, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM open_source_projects WHERE tenant_id IS NULL OR tenant_id = ${tid}::uuid) AS repos,
      (SELECT COUNT(*)::int FROM student_oss_contributions WHERE status = 'claimed' AND (tenant_id IS NULL OR tenant_id = ${tid}::uuid)) AS pending,
      (SELECT COUNT(*)::int FROM student_oss_contributions WHERE status = 'verified' AND (tenant_id IS NULL OR tenant_id = ${tid}::uuid)) AS verified
  `;

  const projects = await sql`
    SELECT * FROM open_source_projects
    WHERE (tenant_id IS NULL OR tenant_id = ${tid}::uuid)
      AND (${q ? sql`(owner ILIKE ${"%" + q + "%"} OR repo_name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
    ORDER BY stars DESC LIMIT 100
  `;
  const pending = await sql`
    SELECT c.*, p.name AS student_name FROM student_oss_contributions c
    LEFT JOIN profiles p ON p.user_id = c.student_id
    WHERE c.status = 'claimed' AND (c.tenant_id IS NULL OR c.tenant_id = ${tid}::uuid)
    ORDER BY c.created_at DESC LIMIT 50
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`OSS · ${stats?.repos ?? 0} tracked · ${stats?.pending ?? 0} claimed · ${stats?.verified ?? 0} verified`} title="Open source console" desc="Curate repos for this chapter — merged PRs in tracked repos verify automatically via webhook." />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Tracked repos", value: stats?.repos ?? 0, icon: Github, sub: "curated" },
            { label: "Pending claims", value: stats?.pending ?? 0, icon: Clock3, sub: "needs review" },
            { label: "Verified merges", value: stats?.verified ?? 0, icon: CheckCircle2, sub: "all time" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: s.label === "Pending claims" && (stats?.pending ?? 0) > 0 ? "var(--accent)" : "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <form method="get" className="mb-4 flex items-center gap-2 rounded-2xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="search">
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input name="q" defaultValue={q} placeholder="Search owner or repo…" className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text)" }} />
          <button className="btn-ink !py-1.5 text-xs">Search</button>
          {q && <Link href="/admin/opensource" prefetch={false} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="meta ml-auto hidden sm:block">{projects.length} repos</span>
        </form>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Github size={14} /> Curated projects</h2>
              <span className="meta">by stars</span>
            </div>
            {projects.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No repos yet</p>
                <p className="narrative mx-auto mt-2 max-w-md">Curate the first repo — students claim PRs against this list and merges verify automatically.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {projects.map((p) => {
                  const tone = diffTone(p.difficulty);
                  return (
                    <li key={p.id} className="group flex items-center justify-between gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-mono text-sm font-medium" style={{ color: "var(--text)" }}>{p.owner}/{p.repo_name}</span>
                          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}><Star size={10} /> {p.stars ?? 0}</span>
                          <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium" style={{ background: tone.bg, color: tone.color, borderColor: "var(--line)" }}>{tone.label}</span>
                          {p.tenant_id ? <span className="meta rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>chapter</span> : <span className="meta">global</span>}
                        </span>
                        {p.description && <span className="mt-1 block truncate text-xs" style={{ color: "var(--text-muted)" }}>{p.description}</span>}
                      </span>
                      <a href={p.github_repo_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:border-[var(--accent)]" style={{ borderColor: "var(--line)", color: "var(--accent)" }}><ExternalLink size={12} /> Open</a>
                    </li>
                  );
                })}
              </ul>
            )}
            <h3 className="mt-6 flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text)" }}><GitPullRequest size={12} /> Curate a new repo</h3>
            <div className="mt-3"><CurateForm /></div>
          </section>

          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Clock3 size={14} /> Pending claims · {pending.length}</h2>
              <span className="meta">oldest first</span>
            </div>
            {pending.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <p className="narrative">Inbox zero. Merged PRs in tracked repos verify automatically via webhook.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {pending.map((c) => (
                  <li key={c.id} className="rounded-xl border p-4 transition hover:shadow-sm" style={{ borderColor: "color-mix(in srgb, var(--accent) 18%, var(--line))", background: "var(--bg)" }}>
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{c.title || c.pr_url}</p>
                    <p className="meta mt-1">{c.student_name || c.student_id.slice(0, 8)} · {c.contribution_type} · {c.pr_number ? `#${c.pr_number}` : ""}</p>
                    <a href={c.pr_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-xs hover:underline" style={{ color: "var(--accent)" }}>{String(c.pr_url).slice(0, 56)} <ExternalLink size={10} /></a>
                    {c.files_changed != null && <p className="meta mt-1">{c.files_changed} files · +{c.lines_added} / -{c.lines_deleted}</p>}
                    <div className="mt-3"><ReviewButtons id={c.id} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
