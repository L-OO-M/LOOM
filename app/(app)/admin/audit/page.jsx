import { redirect } from "next/navigation";
import { Clock3, User, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import "../_components/admin-ledger.css";

export default async function AdminAuditPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/audit");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/audit");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT COUNT(*)::int AS total FROM audit_logs WHERE tenant_id = ${tid}::uuid
  `;

  const rows = await sql`
    SELECT a.*, p.name AS actor_name
    FROM audit_logs a
    LEFT JOIN profiles p ON p.user_id = a.actor_id
    WHERE a.tenant_id = ${tid}::uuid
      AND (${q ? sql`(a.action ILIKE ${"%" + q + "%"} OR a.resource ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
    ORDER BY a.created_at DESC LIMIT 100
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Operations / ${stats?.total ?? 0} events / this chapter`}
          title="Audit log"
          lede="Who changed what — tenant-scoped, immutable, and never containing secrets or tokens."
          meta={`Newest first / cap 100 / ${rows.length} shown`}
          tone="ledger"
          stats={[
            { value: stats?.total ?? 0, label: "events on record" },
            { value: rows.length, label: "rows in view" }
          ]}
        />

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search action, resource, or actor…" aria-label="Search audit log" />
          </label>
          <button className="btn-ink !py-1.5 text-xs">Search</button>
          {q && <a href="/admin/audit" className="aled-meta" style={{ color: "var(--accent)" }}>Clear</a>}
          <span className="aled-meta ml-auto hidden sm:block">{rows.length} shown / cap 100</span>
        </form>

        <WorkspaceSection index="01" title="Audit stream" note="Newest first. Search matches action, resource, or actor name." action={<span className="aled-meta">cap 100</span>}>
          {rows.length === 0 ? (
            <WorkspaceEmpty
              title={q ? "No events match your search" : "No audit events yet"}
              body={q ? "Try a different action, resource, or actor name." : "Actions from this chapter will appear here as they happen."}
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
                    {e.actor_name || e.actor_id.slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
