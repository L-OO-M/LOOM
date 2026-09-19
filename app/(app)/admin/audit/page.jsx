import { redirect } from "next/navigation";
import { ShieldCheck, Clock3, User, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";

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
    SELECT COUNT(*)::int AS total FROM audit_logs WHERE (metadata->>'tenant_id') = ${tid}::text
  `;

  const rows = await sql`
    SELECT a.*, p.name AS actor_name
    FROM audit_logs a
    LEFT JOIN profiles p ON p.user_id = a.actor_id
    WHERE (a.metadata->>'tenant_id') = ${tid}::text
      AND (${q ? sql`(a.action ILIKE ${"%" + q + "%"} OR a.resource ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
    ORDER BY a.created_at DESC LIMIT 100
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Operations · ${stats?.total ?? 0} events · this chapter`} title="Audit log" desc="Who changed what — tenant-scoped, immutable, and never containing secrets or tokens." />
        <form method="get" className="mb-4 flex items-center gap-2 rounded-2xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="search">
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input name="q" defaultValue={q} placeholder="Search action, resource, or actor…" className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text)" }} />
          <button className="btn-ink !py-1.5 text-xs">Search</button>
          {q && <a href="/admin/audit" className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear</a>}
          <span className="meta ml-auto hidden sm:block">{rows.length} shown · cap 100</span>
        </form>

        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            <ShieldCheck size={14} style={{ color: "var(--text-muted)" }} />
            <Meta>Audit stream · newest first · cap 100</Meta>
          </div>
          {rows.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>{q ? "No events match your search." : "No audit events yet — actions from this page will appear here."}</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
              {rows.map((e) => (
                <li key={e.id} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[160px_1fr_auto] sm:items-start">
                  <span className="flex items-center gap-1.5 font-mono text-xs" style={{ color: "var(--text-muted)" }}><Clock3 size={11} /> {new Date(e.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <span className="min-w-0">
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>{e.action.replaceAll("_", " ")}</span>
                    <span className="ml-2 truncate text-sm" style={{ color: "var(--text-muted)" }}>{e.resource}/{String(e.resource_id || "").slice(0, 8)}</span>
                  </span>
                  <span className="flex items-center gap-1 truncate text-xs sm:justify-end" style={{ color: "var(--text-muted)" }}><User size={11} /> {e.actor_name || e.actor_id.slice(0, 8)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppShell>
  );
}
