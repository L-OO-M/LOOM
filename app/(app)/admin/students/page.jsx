import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";

export default async function AdminStudentsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/students");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/students");
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const q = sp?.q || "";
  const rows = q
    ? await sql`SELECT * FROM profiles WHERE (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) AND (name ILIKE ${"%" + q + "%"} OR user_id ILIKE ${"%" + q + "%"}) ORDER BY updated_at DESC LIMIT 50`
    : await sql`SELECT * FROM profiles WHERE (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) ORDER BY updated_at DESC LIMIT 50`;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="College" title="Students" desc="Search, open, and manage roles. Role changes are audited." />
        <form method="get" className="mb-5 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name or user id…" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 }} />
          <button className="btn-ink">Search</button>
        </form>
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)" }}>
          {rows.map((s) => (
            <Link key={s.user_id} href={`/admin/students/${s.user_id}`} className="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{s.name}</span>
              <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{s.role} · {s.primary_domain || "—"}</span>
              <span className="text-xs" style={{ color: "var(--accent)" }}>Open →</span>
            </Link>
          ))}
          {rows.length === 0 && <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>No students found.</p>}
        </div>
      </main>
    </AppShell>
  );
}
