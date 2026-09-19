import { redirect } from "next/navigation";
import Link from "next/link";
import { Library, Search, Clock3, ExternalLink, GraduationCap, Layers } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { ResourceForm } from "@/components/admin-forms";

function kindTone(k) {
  const m = { article: "#0ea5e9", video: "#a855f7", doc: "#16a34a" };
  return m[k] || "var(--text-muted)";
}

export default async function AdminResourcesPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/resources");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/resources");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const domain = sp?.domain || "";
  const kind = sp?.kind || "";

  const [stats] = await sql`
    SELECT COUNT(*)::int AS total, COUNT(DISTINCT domain)::int AS domains,
           COALESCE(SUM(minutes),0)::int AS minutes
    FROM resources
  `;
  const domains = await sql`SELECT DISTINCT domain FROM resources ORDER BY domain`;
  const rows = await sql`
    SELECT * FROM resources
    WHERE (${q ? sql`(title ILIKE ${"%" + q + "%"} OR domain ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${domain ? sql`domain = ${domain}` : sql`TRUE`})
      AND (${kind ? sql`kind = ${kind}` : sql`TRUE`})
    ORDER BY domain ASC, minutes ASC
    LIMIT 100
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader
          kicker={`Content · ${stats?.total ?? 0} resources · ${stats?.domains ?? 0} domains · ${Math.round((stats?.minutes ?? 0) / 60)}h total`}
          title="Resources"
          desc="Global catalog students learn from — curated per domain and level. Keep titles precise; minutes should be honest."
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Resources", value: stats?.total ?? 0, icon: Library, sub: "catalog" },
            { label: "Domains", value: stats?.domains ?? 0, icon: Layers, sub: "tracks" },
            { label: "Hours", value: `${Math.round((stats?.minutes ?? 0) / 60)}h`, icon: Clock3, sub: `${stats?.minutes ?? 0} min` },
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
            <input name="q" defaultValue={q} placeholder="Search title or domain…" className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }} />
          </div>
          <select name="domain" defaultValue={domain} className="rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="">All domains</option>
            {domains.map((d) => <option key={d.domain} value={d.domain}>{d.domain}</option>)}
          </select>
          <select name="kind" defaultValue={kind} className="rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="">All kinds</option>
            <option value="article">Article</option>
            <option value="video">Video</option>
            <option value="doc">Doc</option>
          </select>
          <button className="btn-ink !py-2.5 text-sm">Filter</button>
          {(q || domain || kind) && <Link href="/admin/resources" prefetch={false} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="meta ml-auto hidden sm:block">{rows.length} shown · cap 100</span>
        </form>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="flex items-center gap-2">
              <Library size={14} style={{ color: "var(--text-muted)" }} />
              <Meta>Catalog · by domain, then shortest first</Meta>
            </div>
            {rows.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No resources match</p>
                <p className="narrative mx-auto mt-2 max-w-md">Try clearing filters or add the first resource on the right.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {rows.map((r) => (
                  <li key={r.id} className="group flex items-center justify-between gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{r.title}</span>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: kindTone(r.kind) }}>{r.kind}</span>
                        <span className="inline-flex rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>{r.domain}</span>
                        {r.level && <span className="meta rounded-full border px-2 py-0.5 capitalize" style={{ borderColor: "var(--line)" }}>{r.level}</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {r.minutes} min</span>
                        <span className="font-mono text-[11px]">{r.id.slice(0, 8)}</span>
                      </span>
                    </span>
                    {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)]" style={{ borderColor: "var(--line)", color: "var(--accent)" }}><ExternalLink size={12} /> Open</a> : <span className="meta shrink-0">no url</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            <ResourceForm />
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text)" }}><GraduationCap size={12} /> Curation tips</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                <li>· Keep titles searchable — include the core concept.</li>
                <li>· Minutes should be real completion time, not video length.</li>
                <li>· One resource per URL; duplicates dilute progress.</li>
              </ul>
              <Link href="/admin/roadmaps" prefetch={false} className="mt-3 inline-flex text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Manage roadmaps →</Link>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
