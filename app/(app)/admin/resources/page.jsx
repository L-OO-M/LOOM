import { redirect } from "next/navigation";
import Link from "next/link";
import { Library, Search, Clock3, ExternalLink, GraduationCap, ChevronLeft, ChevronRight } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { ResourceForm } from "@/components/admin-forms";
import { pageHref, pageWindow } from "@/lib/pagination";
import "../_components/admin-ledger.css";
// Reuse the roster pager styles; `.rosterx` only supplies the --adst-* aliases.
import "../students/students.css";

const KIND_TAG = { article: "aled-tag--info", video: "aled-tag--accent", doc: "aled-tag--success" };
const PAGE_SIZE = 50;
const BASE_PATH = "/admin/resources";

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
  const requestedPage = sp?.page;

  const [stats] = await sql`
    SELECT COUNT(*)::int AS total, COUNT(DISTINCT domain)::int AS domains,
           COALESCE(SUM(minutes),0)::int AS minutes
    FROM resources
  `;
  const domains = await sql`SELECT DISTINCT domain FROM resources ORDER BY domain`;
  const nodes = await sql`SELECT id, title, domain, sort_order FROM roadmap_nodes ORDER BY domain ASC, sort_order ASC`;
  const nodeLabel = new Map(nodes.map((n) => [n.id, `${n.domain} · ${n.title}`]));

  // resources is the global catalog (no tenant_id), so the filtered COUNT below
  // shares the list query's predicate and nothing else.
  const [{ total = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS total FROM resources
    WHERE (${q ? sql`(title ILIKE ${"%" + q + "%"} OR domain ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${domain ? sql`domain = ${domain}` : sql`TRUE`})
      AND (${kind ? sql`kind = ${kind}` : sql`TRUE`})
  `;
  const win = pageWindow(total, requestedPage, PAGE_SIZE);

  // A page past the end asks for nothing rather than replaying another page's
  // rows; the empty state says which page exists instead.
  let rows = [];
  if (win.total > 0 && !win.outOfRange) {
    rows = await sql`
      SELECT * FROM resources
      WHERE (${q ? sql`(title ILIKE ${"%" + q + "%"} OR domain ILIKE ${"%" + q + "%"})` : sql`TRUE`})
        AND (${domain ? sql`domain = ${domain}` : sql`TRUE`})
        AND (${kind ? sql`kind = ${kind}` : sql`TRUE`})
      ORDER BY domain ASC, minutes ASC, id ASC
      LIMIT ${PAGE_SIZE} OFFSET ${win.offset}
    `;
  }
  const filterParams = { q, domain, kind };

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Content / ${stats?.total ?? 0} resources / ${stats?.domains ?? 0} domains / ${Math.round((stats?.minutes ?? 0) / 60)}h total`}
          title="Resources"
          lede="Global catalog students learn from — curated per domain and level. Keep titles precise; minutes should be honest."
          meta={`${win.total} matched / page ${win.page} of ${win.pages || 1} / ${nodes.length} roadmap nodes linked / by domain, then shortest first`}
          tone="field"
          art="/storyloom/learning.png"
          artAlt=""
          stats={[
            { value: stats?.total ?? 0, label: "resources" },
            { value: stats?.domains ?? 0, label: "domains" },
            { value: `${Math.round((stats?.minutes ?? 0) / 60)}h`, label: "total length" }
          ]}
        />

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search title or domain…" aria-label="Search resources" />
          </label>
          <select name="domain" defaultValue={domain} className="aled-select" aria-label="Filter by domain">
            <option value="">All domains</option>
            {domains.map((d) => <option key={d.domain} value={d.domain}>{d.domain}</option>)}
          </select>
          <select name="kind" defaultValue={kind} className="aled-select" aria-label="Filter by kind">
            <option value="">All kinds</option>
            <option value="article">Article</option>
            <option value="video">Video</option>
            <option value="doc">Doc</option>
          </select>
          <button className="btn-ink !py-1.5 text-xs">Filter</button>
          {(q || domain || kind) && <Link href={BASE_PATH} prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{win.total} matched · {PAGE_SIZE} per page</span>
        </form>

        <div className="aled-split">
          <WorkspaceSection index="01" title="Catalog" note="By domain, then shortest first. Linked nodes are shown inline." action={<span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><Library size={12} aria-hidden="true" /> {win.total}</span>}>
            {win.outOfRange ? (
              <WorkspaceEmpty
                title={`Page ${win.requestedPage} is past the end of this catalog`}
                body={`${win.total} matching resource${win.total === 1 ? "" : "s"} fit on ${win.pages} page${win.pages === 1 ? "" : "s"} at ${PAGE_SIZE} per page. Nothing is shown here rather than repeating another page's rows.`}
                action={
                  <Link href={pageHref(BASE_PATH, filterParams, win.pages)} prefetch={false} style={{ color: "var(--accent)" }} className="aled-meta">
                    Go to the last page ({win.pages})
                  </Link>
                }
              />
            ) : rows.length === 0 ? (
              <WorkspaceEmpty title="No resources match" body="Try clearing filters or add the first resource in the panel beside this list." />
            ) : (
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                {rows.map((r) => (
                  <li key={r.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                    <div className="aled-copy">
                      <span className="aled-title">{r.title}</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                        <span className={`aled-tag ${KIND_TAG[r.kind] || ""}`} style={{ textTransform: "capitalize" }}>{r.kind}</span>
                        <span className="aled-tag">{r.domain}</span>
                        {r.level && <span className="aled-tag" style={{ textTransform: "capitalize" }}>{r.level}</span>}
                        {r.node_id && nodeLabel.has(r.node_id) && (
                          <span className="aled-tag aled-tag--accent" title={`Linked to node: ${nodeLabel.get(r.node_id)}`}>
                            ⌁ {nodeLabel.get(r.node_id)}
                          </span>
                        )}
                      </div>
                      <p className="aled-sub" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><Clock3 size={11} aria-hidden="true" /> {r.minutes} min</span>
                        <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>{r.id.slice(0, 8)}</span>
                      </p>
                    </div>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="aled-tag aled-tag--accent">
                        <ExternalLink size={12} aria-hidden="true" /> Open
                      </a>
                    ) : (
                      <span className="aled-meta">no url</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!win.outOfRange && win.pages > 1 && (
              <div className="rosterx">
                <nav className="adst-pager" aria-label="Resource pages">
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

          <WorkspaceSection index="02" title="Add a resource" note="Minutes should be real completion time, not video length.">
            <div className="aled-stack">
              <div className="aled-panel"><ResourceForm nodes={nodes} /></div>
              <div className="aled-panel">
                <p className="aled-panel-title"><GraduationCap size={12} aria-hidden="true" /> Curation tips</p>
                <ul className="aled-notes">
                  <li>Keep titles searchable — include the core concept.</li>
                  <li>Minutes should be real completion time, not video length.</li>
                  <li>One resource per URL; duplicates dilute progress.</li>
                </ul>
                <Link href="/admin/roadmaps" prefetch={false} className="aled-meta" style={{ color: "var(--accent)", display: "inline-block", marginTop: "0.8rem" }}>Manage roadmaps →</Link>
              </div>
            </div>
          </WorkspaceSection>
        </div>
      </main>
    </AppShell>
  );
}
