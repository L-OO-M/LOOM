import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, User, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import "../_components/admin-ledger.css";

const PAGE_SIZE = 50;

function day(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
}

export default async function AdminAuditPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/audit");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/audit");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const action = (sp?.action || "").trim();
  const resource = (sp?.resource || "").trim();
  const from = day(sp?.from);
  const to = day(sp?.to);
  const page = Math.max(1, parseInt(sp?.page || "1", 10) || 1);
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT COUNT(*)::int AS total FROM audit_logs WHERE tenant_id = ${tid}::uuid
  `;

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS total
    FROM audit_logs a
    LEFT JOIN profiles p ON p.user_id = a.actor_id
    WHERE a.tenant_id = ${tid}::uuid
      AND (${q ? sql`(a.action ILIKE ${"%" + q + "%"} OR a.resource ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${action ? sql`a.action = ${action}` : sql`TRUE`})
      AND (${resource ? sql`a.resource = ${resource}` : sql`TRUE`})
      AND (${from ? sql`a.created_at >= ${from}::date` : sql`TRUE`})
      AND (${to ? sql`a.created_at < (${to}::date + INTERVAL '1 day')` : sql`TRUE`})
  `;
  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const rows = await sql`
    SELECT a.*, p.name AS actor_name
    FROM audit_logs a
    LEFT JOIN profiles p ON p.user_id = a.actor_id
    WHERE a.tenant_id = ${tid}::uuid
      AND (${q ? sql`(a.action ILIKE ${"%" + q + "%"} OR a.resource ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${action ? sql`a.action = ${action}` : sql`TRUE`})
      AND (${resource ? sql`a.resource = ${resource}` : sql`TRUE`})
      AND (${from ? sql`a.created_at >= ${from}::date` : sql`TRUE`})
      AND (${to ? sql`a.created_at < (${to}::date + INTERVAL '1 day')` : sql`TRUE`})
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `;

  const activeFilters = [q && `search: ${q}`, action && `action: ${action}`, resource && `resource: ${resource}`, from && `from: ${from}`, to && `to: ${to}`].filter(Boolean);

  function pageHref(nextPage) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (action) params.set("action", action);
    if (resource) params.set("resource", resource);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  }

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Operations / ${stats?.total ?? 0} events / this chapter`}
          title="Audit log"
          lede="Who changed what - tenant-scoped, immutable, and never containing secrets or tokens."
          meta={`Newest first / ${total} matching / page ${currentPage} of ${totalPages}`}
          tone="ledger"
          stats={[
            { value: stats?.total ?? 0, label: "events on record" },
            { value: total, label: "matching filters" }
          ]}
        />

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search action, resource, or actor" aria-label="Search audit log" />
          </label>
          <input name="action" defaultValue={action} className="aled-select" placeholder="Action" aria-label="Filter by exact action" />
          <input name="resource" defaultValue={resource} className="aled-select" placeholder="Resource" aria-label="Filter by exact resource" />
          <input name="from" defaultValue={from} type="date" className="aled-select" aria-label="From date" />
          <input name="to" defaultValue={to} type="date" className="aled-select" aria-label="To date" />
          <button className="btn-ink !py-1.5 text-xs">Filter</button>
          {(q || action || resource || from || to) && <Link href="/admin/audit" prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{total} matching</span>
        </form>

        {activeFilters.length > 0 && (
          <div className="aled-toolbar" style={{ borderTop: "none", paddingTop: 0 }}>
            <span className="aled-meta">Active</span>
            {activeFilters.map((f) => <span key={f} className="aled-tag">{f}</span>)}
          </div>
        )}

        <WorkspaceSection index="01" title="Audit stream" note="Newest first. Search matches action, resource, or actor name." action={<span className="aled-meta">{rows.length} shown / {total} matched</span>}>
          {rows.length === 0 ? (
            <WorkspaceEmpty
              title={activeFilters.length > 0 ? "No events match these filters" : "No audit events yet"}
              body={activeFilters.length > 0 ? "Try a different action, resource, date, or actor name." : "Actions from this chapter will appear here as they happen."}
            />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {rows.map((e) => (
                <li key={e.id} className="aled-row" style={{ "--aled-cols": "7.5rem minmax(0, 1fr) auto" }}>
                  <span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    <Clock3 size={11} aria-hidden="true" />
                    {new Date(e.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <div className="aled-copy">
                    <span className="aled-title" style={{ display: "inline" }}>{e.action.replaceAll("_", " ")}</span>
                    <span className="aled-sub" style={{ display: "inline", marginLeft: "0.45rem" }}>{e.resource}/{String(e.resource_id || "").slice(0, 8)}</span>
                  </div>
                  <span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    <User size={11} aria-hidden="true" />
                    {e.actor_name || String(e.actor_id || "").slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        {totalPages > 1 && (
          <nav className="aled-toolbar" aria-label="Audit pages">
            <Link
              href={pageHref(Math.max(1, currentPage - 1))}
              prefetch={false}
              aria-disabled={currentPage === 1}
              className="btn-ink !py-1.5 text-xs"
              style={{ opacity: currentPage === 1 ? 0.45 : 1, pointerEvents: currentPage === 1 ? "none" : "auto" }}
            >
              Previous
            </Link>
            <span className="aled-meta">Page {currentPage} of {totalPages}</span>
            <Link
              href={pageHref(Math.min(totalPages, currentPage + 1))}
              prefetch={false}
              aria-disabled={currentPage === totalPages}
              className="btn-ink !py-1.5 text-xs"
              style={{ opacity: currentPage === totalPages ? 0.45 : 1, pointerEvents: currentPage === totalPages ? "none" : "auto" }}
            >
              Next
            </Link>
          </nav>
        )}
      </main>
    </AppShell>
  );
}
