import { scope } from "@/lib/tenant-scope";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Search, ArrowUpRight, ExternalLink, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { pageHref, pageWindow } from "@/lib/pagination";
import ProjectReviewActions from "./_components/ProjectReviewActions";
import "../_components/admin-ledger.css";
// Reuse the roster pager/pager-state styles rather than shipping a second pager
// look; `.rosterx` only supplies the --adst-* aliases those classes read.
import "../students/students.css";

// docs/25 §4.4: admin lists page at 50 rows. LIMIT and the offset arithmetic
// share this constant so the stride can never drift from the page.
const PAGE_SIZE = 50;
const BASE_PATH = "/admin/projects";

export default async function AdminProjectsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/projects");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/projects");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const status = sp?.status || "";
  const requestedPage = sp?.page;
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active,
           COUNT(DISTINCT owner_id)::int AS builders
    FROM projects WHERE tenant_id = ${scope(tid)}::uuid
  `;

  // The count repeats the list query's filters (never its LIMIT) so `total`
  // describes exactly the rows the pager can reach.
  const [{ total = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS total
    FROM projects pr
    LEFT JOIN profiles p ON p.user_id = pr.owner_id
    WHERE pr.tenant_id = ${scope(tid)}::uuid
      AND (${q ? sql`(pr.title ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${status ? sql`pr.status = ${status}` : sql`TRUE`})
  `;
  const win = pageWindow(total, requestedPage, PAGE_SIZE);

  // A page past the end asks for nothing rather than replaying another page's
  // rows; the empty state below says which page exists instead.
  let rows = [];
  if (win.total > 0 && !win.outOfRange) {
    rows = await sql`
      SELECT pr.*, p.name AS owner_name, p.github_username, n.title AS node_title
      FROM projects pr
      LEFT JOIN profiles p ON p.user_id = pr.owner_id
      LEFT JOIN roadmap_nodes n ON n.id = pr.roadmap_node_id
      WHERE pr.tenant_id = ${scope(tid)}::uuid
        AND (${q ? sql`(pr.title ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
        AND (${status ? sql`pr.status = ${status}` : sql`TRUE`})
      ORDER BY pr.created_at DESC, pr.id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${win.offset}
    `;
  }

  const filterParams = { q, status };
  const pagerId = "Project pages";

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Build / ${stats?.total ?? 0} projects / ${stats?.builders ?? 0} builders`}
          title="Projects"
          lede="Review student work — every project links to its owner, roadmap node, and repo."
          meta={`${stats?.active ?? 0} active / ${win.total} matched / page ${win.page} of ${win.pages || 1}`}
          tone="field"
          art="/domains-art/domain-creative.png"
          artAlt=""
          stats={[
            { value: stats?.total ?? 0, label: "projects" },
            { value: stats?.active ?? 0, label: "active" },
            { value: stats?.builders ?? 0, label: "unique builders" }
          ]}
        />

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search title or owner…" aria-label="Search projects" />
          </label>
          <select name="status" defaultValue={status} className="aled-select" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="in_review">In review</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>
          <button className="btn-ink !py-1.5 text-xs">Filter</button>
          {(q || status) && <Link href={BASE_PATH} prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{win.total} matched · {PAGE_SIZE} per page</span>
        </form>

        <WorkspaceSection index="01" title="Project ledger" note="Each row links to its owner, roadmap node, and repo." action={<span className="aled-meta">{win.total} rows</span>}>
          {win.outOfRange ? (
            <WorkspaceEmpty
              title={`Page ${win.requestedPage} is past the end of this ledger`}
              body={`${win.total} matching project${win.total === 1 ? "" : "s"} fit on ${win.pages} page${win.pages === 1 ? "" : "s"} at ${PAGE_SIZE} per page. Nothing is shown here rather than repeating another page's rows.`}
              action={
                <Link href={pageHref(BASE_PATH, filterParams, win.pages)} prefetch={false} style={{ color: "var(--accent)" }} className="aled-meta">
                  Go to the last page ({win.pages})
                </Link>
              }
            />
          ) : rows.length === 0 ? (
            <WorkspaceEmpty title="No projects" body="Student projects appear here once created from the Build workspace. Encourage shipping — projects fuel the leaderboard and proof." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {rows.map((p) => (
                <li key={p.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title">{p.title}</span>
                    <p className="aled-sub">
                      {p.owner_name || p.owner_id.slice(0, 8)}{p.github_username ? ` · @${p.github_username}` : ""}
                      {" · "}{new Date(p.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      {" · "}<span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>{p.id.slice(0, 8)}</span>
                    </p>
                    {p.description && <p className="aled-sub" style={{ color: "var(--text)" }}>{p.description}</p>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.4rem" }}>
                      <span className="aled-tag" style={{ textTransform: "capitalize" }}>{p.status}</span>
                      {p.node_title && <span className="aled-tag"><Layers size={10} aria-hidden="true" /> {p.node_title}</span>}
                    </div>
                  </div>
                  <div className="aled-actions">
                    {p.repo_url && (
                      <a href={p.repo_url} target="_blank" rel="noreferrer" className="aled-tag aled-tag--accent">
                        <ExternalLink size={12} aria-hidden="true" /> Repo
                      </a>
                    )}
                    <Link href={`/student/projects/${p.id}`} prefetch={false} className="aled-tag aled-tag--accent">
                      Open <ArrowUpRight size={12} aria-hidden="true" />
                    </Link>
                    {(p.evidence_state === "provisional" || p.evidence_state === "verified") && (
                      <ProjectReviewActions projectId={p.id} title={p.title} state={p.evidence_state} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!win.outOfRange && win.pages > 1 && (
            <div className="rosterx">
              <nav className="adst-pager" aria-label={pagerId}>
                {win.hasPrev ? (
                  <Link href={pageHref(BASE_PATH, filterParams, win.page - 1)} prefetch={false} rel="prev" className="adst-pager-step">
                    <ChevronLeft size={12} aria-hidden="true" /> Previous
                  </Link>
                ) : (
                  <span className="adst-pager-step is-disabled" aria-disabled="true">
                    <ChevronLeft size={12} aria-hidden="true" /> Previous
                    <span className="sr-only"> — already on the first page</span>
                  </span>
                )}
                <p className="adst-pager-count">
                  Showing <strong>{win.from}&ndash;{win.to}</strong> of {win.total}
                  <span className="adst-pager-position" aria-current="page">Page {win.page} of {win.pages}</span>
                </p>
                {win.hasNext ? (
                  <Link href={pageHref(BASE_PATH, filterParams, win.page + 1)} prefetch={false} rel="next" className="adst-pager-step">
                    Next <ChevronRight size={12} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="adst-pager-step is-disabled" aria-disabled="true">
                    Next <ChevronRight size={12} aria-hidden="true" />
                    <span className="sr-only"> — already on the last page</span>
                  </span>
                )}
              </nav>
            </div>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
