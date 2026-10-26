import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, FileCheck, Clock3, Search, ArrowUpRight, ExternalLink } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { ContestForm } from "@/components/admin-forms";
import { ContestFunnelBars, ContestConversionBars } from "@/components/admin/RemainingCharts";
import "../_components/admin-ledger.css";

function statusTone(s) {
  const m = {
    draft: { label: "Draft", className: "" },
    published: { label: "Published", className: "aled-tag--info" },
    open: { label: "Open", className: "aled-tag--success" },
    active: { label: "Active", className: "aled-tag--success" },
    closed: { label: "Closed", className: "" },
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
        <WorkspaceMasthead
          kicker={`Compete / ${stats?.total ?? 0} contests / ${stats?.live ?? 0} live / ${stats?.submissions ?? 0} submissions`}
          title="Contests"
          lede="Create, publish, and judge. Draft first, then open registration — submissions flow into the inbox below."
          meta={`${rows.length} shown in this view / newest first / cap 50`}
          tone="field"
          art="/events/event-contest.png"
          artAlt=""
          stats={[
            { value: stats?.total ?? 0, label: "contests all time" },
            { value: stats?.live ?? 0, label: "open or active" },
            { value: stats?.drafts ?? 0, label: "drafts awaiting publish" },
            { value: stats?.submissions ?? 0, label: "submissions" }
          ]}
        />

        <WorkspaceSection index="01" title="Competition shape" note="Funnel counts and registration-to-submission conversion for the newest contests.">
          <div className="adminx-chart-grid">
            <div className="adminx-chart">
              <ContestFunnelBars data={[
                { name: "Draft", value: stats?.drafts ?? 0 },
                { name: "Live", value: stats?.live ?? 0 },
                { name: "Closed", value: Math.max(0, (stats?.total ?? 0) - (stats?.drafts ?? 0) - (stats?.live ?? 0)) },
              ]} />
            </div>
            <div className="adminx-chart">
              <ContestConversionBars data={rows.slice(0, 5).map((r) => ({ name: r.title.slice(0, 14), regs: r.registrations, subs: r.submissions }))} />
            </div>
          </div>
        </WorkspaceSection>

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search title or description…" aria-label="Search contests" />
          </label>
          <select name="status" defaultValue={status} className="aled-select" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="open">Open</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
          <button className="btn-ink !py-2 text-xs">Filter</button>
          {(q || status) && <Link href="/admin/contests" prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{rows.length} shown</span>
        </form>

        <div className="aled-split">
          <section aria-label="Contest ledger">
            <div className="aled-meta">Contests / newest first</div>
            {rows.length === 0 ? (
              <WorkspaceEmpty
                title="No contests yet"
                body="Create a draft on the right — publish when the brief, dates, and judging criteria are ready. Students register from /student/contests."
              />
            ) : (
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                {rows.map((c) => {
                  const tone = statusTone(c.status);
                  return (
                    <li key={c.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                      <div className="aled-copy">
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
                          <span className="aled-title" style={{ display: "inline" }}>{c.title}</span>
                          <span className={`aled-tag ${tone.className}`}>{tone.label}</span>
                        </div>
                        {c.description && <p className="aled-sub">{c.description}</p>}
                        <p className="aled-sub" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem 0.7rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Users size={11} aria-hidden="true" /> {c.registrations} registered</span>
                          <span>{c.submissions} submissions</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Clock3 size={11} aria-hidden="true" /> {c.starts_at ? new Date(c.starts_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "no start"}</span>
                          <span>{c.id.slice(0, 8)}</span>
                        </p>
                      </div>
                      <span className="aled-actions" aria-hidden="true"><ArrowUpRight size={12} /></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="aled-stack">
            <WorkspaceSection title="New contest" note="Draft first. Publish when the brief, dates, and judging criteria are ready." className="mt-0">
              <div className="aled-panel"><ContestForm /></div>
            </WorkspaceSection>
            <div className="aled-panel">
              <p className="aled-panel-title"><FileCheck size={12} aria-hidden="true" /> Judging flow</p>
              <ul className="aled-notes">
                <li>Draft → Published → Open → Closed.</li>
                <li>Submissions appear below the moment a student submits.</li>
                <li>Use the inbox to open links and judge.</li>
              </ul>
            </div>
          </div>
        </div>

        <WorkspaceSection index="02" title="Submissions inbox" note="Newest first, capped at 20. Open the link to judge the work." action={<span className="aled-meta">cap 20</span>}>
          {subs.length === 0 ? (
            <WorkspaceEmpty
              title="No submissions yet"
              body="When students submit work, it lands here with their note and link."
            />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {subs.map((s) => (
                <li key={s.id} className="aled-row" style={{ "--aled-cols": "minmax(9rem, 0.7fr) minmax(0, 1fr) 4.5rem" }}>
                  <div className="aled-copy">
                    <span className="aled-title">{s.student_name || s.student_id.slice(0, 8)}</span>
                    <p className="aled-sub">{s.contest_title}</p>
                  </div>
                  <div className="aled-copy">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="aled-sub" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--accent)", fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: "0.62rem" }}>
                        {String(s.url).slice(0, 48)} <ExternalLink size={10} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="aled-meta">no link</span>
                    )}
                    {s.note && <p className="aled-sub">{s.note}</p>}
                  </div>
                  <span className="aled-meta" style={{ textAlign: "right" }}>{new Date(s.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
