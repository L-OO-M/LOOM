import { redirect } from "next/navigation";
import Link from "next/link";
import { Trophy, Users, FileCheck, Clock3, Search, Plus, ArrowUpRight, ExternalLink } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { ContestForm } from "@/components/admin-forms";
import { ContestFunnelBars, ContestConversionBars } from "@/components/admin/RemainingCharts";

function statusTone(s) {
  const m = {
    draft: { bg: "var(--bg-elevated)", color: "var(--text-muted)", border: "var(--line)", label: "Draft" },
    published: { bg: "color-mix(in srgb, #0ea5e9 10%, var(--bg))", color: "#0284c7", border: "color-mix(in srgb, #0ea5e9 18%, transparent)", label: "Published" },
    open: { bg: "color-mix(in srgb, #16a34a 10%, var(--bg))", color: "#16a34a", border: "color-mix(in srgb, #16a34a 18%, transparent)", label: "Open" },
    active: { bg: "color-mix(in srgb, #16a34a 10%, var(--bg))", color: "#16a34a", border: "color-mix(in srgb, #16a34a 18%, transparent)", label: "Active" },
    closed: { bg: "var(--bg)", color: "var(--text-muted)", border: "var(--line)", label: "Closed" },
  };
  return m[s] || m.draft;
}

export default async function AdminContestsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/contests");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/contests");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const status = sp?.status || "";
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
      COUNT(*) FILTER (WHERE status IN ('open','active','published'))::int AS live,
      (SELECT COUNT(*)::int FROM contest_submissions s JOIN contests c ON c.id = s.contest_id WHERE (c.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS submissions
    FROM contests
    WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL
  `;

  const rows = await sql`
    SELECT c.*,
      COALESCE(r.cnt, 0)::int AS registrations,
      COALESCE(s.cnt, 0)::int AS submissions
    FROM contests c
    LEFT JOIN (SELECT contest_id, COUNT(*)::int AS cnt FROM contest_registrations GROUP BY contest_id) r ON r.contest_id = c.id
    LEFT JOIN (SELECT contest_id, COUNT(*)::int AS cnt FROM contest_submissions GROUP BY contest_id) s ON s.contest_id = c.id
    WHERE (c.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND (${q ? sql`(c.title ILIKE ${"%" + q + "%"} OR c.description ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${status ? sql`c.status = ${status}` : sql`TRUE`})
    ORDER BY c.created_at DESC LIMIT 50
  `;

  const subs = await sql`
    SELECT s.*, c.title AS contest_title, p.name AS student_name FROM contest_submissions s
    JOIN contests c ON c.id = s.contest_id
    LEFT JOIN profiles p ON p.user_id = s.student_id
    WHERE c.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL
    ORDER BY s.created_at DESC LIMIT 20
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Compete · ${stats?.total ?? 0} contests · ${stats?.live ?? 0} live · ${stats?.submissions ?? 0} submissions`} title="Contests" desc="Create, publish, and judge. Draft first, then open registration — submissions flow into the inbox below." />

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: stats?.total ?? 0, icon: Trophy, sub: "all" },
            { label: "Live", value: stats?.live ?? 0, icon: FileCheck, sub: "open / active" },
            { label: "Drafts", value: stats?.drafts ?? 0, icon: Clock3, sub: "awaiting publish" },
            { label: "Submissions", value: stats?.submissions ?? 0, icon: Users, sub: "all time" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: s.label === "Live" && (stats?.live ?? 0) > 0 ? "var(--accent)" : "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="Contest visuals">
          <ContestFunnelBars data={[
            { name: "Draft", value: stats?.drafts ?? 0 },
            { name: "Live", value: stats?.live ?? 0 },
            { name: "Closed", value: Math.max(0, (stats?.total ?? 0) - (stats?.drafts ?? 0) - (stats?.live ?? 0)) },
          ]} />
          <ContestConversionBars data={rows.slice(0, 5).map((r) => ({ name: r.title.slice(0, 14), regs: r.registrations, subs: r.submissions }))} />
        </section>

        <form method="get" className="mb-4 flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="search">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input name="q" defaultValue={q} placeholder="Search title or description…" className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }} />
          </div>
          <select name="status" defaultValue={status} className="rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="open">Open</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
          <button className="btn-ink !py-2.5 text-sm">Filter</button>
          {(q || status) && <Link href="/admin/contests" prefetch={false} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="meta ml-auto hidden sm:block">{rows.length} shown</span>
        </form>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="flex items-center gap-2">
              <Trophy size={14} style={{ color: "var(--text-muted)" }} />
              <Meta>Contests · newest first</Meta>
            </div>
            {rows.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No contests yet</p>
                <p className="narrative mx-auto mt-2 max-w-md">Create a draft on the right — publish when the brief, dates, and judging criteria are ready. Students register from /student/contests.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {rows.map((c) => {
                  const tone = statusTone(c.status);
                  return (
                    <li key={c.id} className="group flex flex-col gap-2 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{c.title}</span>
                          <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium" style={{ background: tone.bg, color: tone.color, borderColor: tone.border }}>{tone.label}</span>
                        </div>
                        {c.description && <p className="narrative mt-1 line-clamp-1 text-xs leading-5">{c.description}</p>}
                        <p className="meta mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1"><Users size={11} /> {c.registrations} registered</span>
                          <span>· {c.submissions} submissions</span>
                          <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {c.starts_at ? new Date(c.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "no start"}</span>
                          <span className="font-mono text-[11px]">{c.id.slice(0, 8)}</span>
                        </p>
                      </div>
                      <span className="hidden shrink-0 text-xs sm:inline-flex" style={{ color: "var(--text-muted)" }}><ArrowUpRight size={12} /></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            <ContestForm />
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text)" }}><FileCheck size={12} /> Judging flow</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                <li>· Draft → Published → Open → Closed.</li>
                <li>· Submissions appear below the moment a student submits.</li>
                <li>· Use the inbox to open links and judge.</li>
              </ul>
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Submissions inbox">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><FileCheck size={14} /> Submissions inbox · {subs.length} latest</h2>
            <span className="meta">newest first · cap 20</span>
          </div>
          {subs.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="narrative">No submissions yet. When students submit work, it lands here with their note and link.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs" style={{ borderColor: "var(--line)", color: "var(--text-muted)", background: "var(--bg-elevated)" }}>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium">Student</th>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium">Contest</th>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium">Submission</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--line)" }}>
                    {subs.map((s) => (
                      <tr key={s.id} className="transition hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]">
                        <td className="px-3 py-3 font-medium" style={{ color: "var(--text)" }}>{s.student_name || s.student_id.slice(0, 8)}</td>
                        <td className="px-3 py-3" style={{ color: "var(--text-muted)" }}>{s.contest_title}</td>
                        <td className="px-3 py-3">
                          {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:underline" style={{ color: "var(--accent)" }}>{String(s.url).slice(0, 48)} <ExternalLink size={10} /></a> : <span className="meta">no link</span>}
                          {s.note && <span className="mt-1 block max-w-xs truncate text-xs" style={{ color: "var(--text-muted)" }}>{s.note}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs" style={{ color: "var(--text-muted)" }}>{new Date(s.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
