import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { DataTable } from "@/components/loom/DataTable";

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
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <PageHeader kicker={`College · ${rows.length} shown`} title="Students" desc="Search, open, and manage roles. Role changes are audited." />
        <form method="get" className="mb-5 flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Search name or user id…" aria-label="Search students" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, minWidth: 240 }} />
          <button className="btn-ink !py-2">Search</button>
        </form>
        <div className="border-y" style={{ borderColor: "var(--line)" }}>
          <DataTable
            caption="Student roster"
            empty="No students found."
            columns={[
              {
                key: "name", label: "Student", render: (s) => (
                  <Link href={`/admin/students/${s.user_id}`} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>{s.name}</Link>
                )
              },
              { key: "role", label: "Role" },
              { key: "primary_domain", label: "Track", render: (s) => s.primary_domain || "—" },
              { key: "department", label: "Dept", render: (s) => s.department || "—" },
              { key: "year", label: "Yr", mono: true, render: (s) => s.year ?? "—" },
              {
                key: "open", label: "", align: "right", render: (s) => (
                  <Link href={`/admin/students/${s.user_id}`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Open →</Link>
                )
              }
            ]}
            rows={rows}
          />
        </div>
      </main>
    </AppShell>
  );
}
