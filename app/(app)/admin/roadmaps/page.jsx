import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Search, ListOrdered } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { NodeForm } from "@/components/admin-forms";
import "../_components/admin-ledger.css";

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
        <WorkspaceMasthead
          kicker={`Content / ${stats?.nodes ?? 0} nodes / ${stats?.domains ?? 0} domains / ${stats?.completions ?? 0} completions in chapter`}
          title="Roadmaps"
          lede="Global catalog — curated learning nodes. Completions below are counted for this chapter only. Drag order via sort_order."
          meta={`${nodes.length} nodes in view / ${stats?.students ?? 0} enrolled students / ${stats?.completions ?? 0} completions`}
          tone="field"
          art="/storyloom/learning.png"
          artAlt=""
          stats={[
            { value: stats?.nodes ?? 0, label: "nodes in catalog" },
            { value: stats?.domains ?? 0, label: "domains" },
            { value: stats?.completions ?? 0, label: "completions" },
            { value: stats?.students ?? 0, label: "students enrolled" }
          ]}
        />

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search title or description…" aria-label="Search roadmap nodes" />
          </label>
          <select name="domain" defaultValue={domain} className="aled-select" aria-label="Filter by domain">
            <option value="">All domains</option>
            {domains.map((d) => <option key={d.domain} value={d.domain}>{d.domain}</option>)}
          </select>
          <button className="btn-ink !py-1.5 text-xs">Filter</button>
          {(q || domain) && <Link href="/admin/roadmaps" prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{nodes.length} shown</span>
        </form>

        <div className="aled-split">
          <WorkspaceSection
            index="01"
            title="Nodes"
            note="Ordered by sort_order. Completion bars are chapter-scoped."
            action={<span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><ListOrdered size={12} aria-hidden="true" /> {nodes.length} total</span>}
          >
            {nodes.length === 0 ? (
              <WorkspaceEmpty title="No nodes match" body="Try clearing the domain filter or add the first node in the panel beside this list." />
            ) : (
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                {nodes.map((n, i) => {
                  const pct = stats?.students ? Math.round((n.completions / stats.students) * 100) : 0;
                  return (
                    <li key={n.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                      <div className="aled-copy">
                        <span className="aled-title">{i + 1}. {n.title}</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                          <span className="aled-tag">{n.domain}</span>
                          <span className="aled-tag">#{n.sort_order}</span>
                          {n.difficulty_level && <span className="aled-tag" style={{ textTransform: "capitalize" }}>{n.difficulty_level}</span>}
                        </div>
                        {n.description && <p className="aled-sub">{n.description}</p>}
                        <span className="aled-meter" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, pct)}%` }} />
                        </span>
                        <p className="aled-sub" style={{ marginTop: "0.35rem" }}>
                          {n.completions} completions · {pct}% of chapter · {n.resources ?? 0} resources
                        </p>
                        <p className="aled-meta" style={{ marginTop: "0.2rem" }}>{n.id}</p>
                      </div>
                      <span className="aled-value">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </WorkspaceSection>

          <WorkspaceSection index="02" title="Add a node" note="Global catalog — every chapter sees the same nodes. sort_order controls the student journey.">
            <div className="aled-stack">
              <div className="aled-panel"><NodeForm /></div>
              <div className="aled-panel">
                <p className="aled-panel-title"><GraduationCap size={12} aria-hidden="true" /> How roadmaps work</p>
                <ul className="aled-notes">
                  <li>Global catalog — every chapter sees the same nodes.</li>
                  <li>Completions are per-chapter (this page counts only your students).</li>
                  <li>sort_order controls the student journey.</li>
                  <li>Editing a node updates its domain and order live.</li>
                </ul>
                <Link href="/admin/resources" prefetch={false} className="aled-meta" style={{ color: "var(--accent)", display: "inline-block", marginTop: "0.8rem" }}>Manage resources →</Link>
              </div>
            </div>
          </WorkspaceSection>
        </div>
      </main>
    </AppShell>
  );
}
