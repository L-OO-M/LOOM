import { redirect } from "next/navigation";
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
  const role = sp?.role || "";
  const dept = sp?.dept || "";
  const departments = await sql`
    SELECT slug, name FROM departments
    WHERE is_active AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    ORDER BY name
  `;
  const rows = await sql`
    SELECT p.*,
      (SELECT json_agg(json_build_object('slug', d.slug, 'level', m.level))
       FROM department_memberships m JOIN departments d ON d.id = m.department_id
       WHERE m.user_id = p.user_id) AS departments
    FROM profiles p
    WHERE (p.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      AND (${q ? sql`(p.name ILIKE ${"%" + q + "%"} OR p.user_id ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${role ? sql`p.role = ${role}` : sql`TRUE`})
      AND (${dept ? sql`EXISTS (SELECT 1 FROM department_memberships m JOIN departments d ON d.id = m.department_id WHERE m.user_id = p.user_id AND d.slug = ${dept})` : sql`TRUE`})
    ORDER BY p.updated_at DESC LIMIT 50
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <PageHeader kicker={`College · ${rows.length} shown`} title="Students" desc="Search, open, and manage roles. Role changes are audited." />
        <form method="get" className="mb-5 flex flex-wrap gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Search name or user id…" aria-label="Search students" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, minWidth: 200 }} />
          <select name="role" defaultValue={role} aria-label="Filter by role" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 }}>
            <option value="">All roles</option>
            <option value="student">student</option>
            <option value="core">core</option>
            <option value="dept_lead">dept_lead</option>
            <option value="vertical_lead">vertical_lead</option>
            <option value="admin">admin</option>
          </select>
          <select name="dept" defaultValue={dept} aria-label="Filter by department" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 }}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
          <button className="btn-ink !py-2">Search</button>
        </form>
        <div className="border-y" style={{ borderColor: "var(--line)" }}>
          <DataTable
            caption="Student roster"
            empty="No students found."
            columns={[
              { key: "name", label: "Student", kind: "student" },
              { key: "role", label: "Role" },
              { key: "primary_domain", label: "Track" },
              { key: "department", label: "Dept" },
              { key: "year", label: "Yr", mono: true },
              { key: "open", label: "", align: "right", kind: "studentOpen" }
            ]}
            rows={rows}
          />
        </div>
      </main>
    </AppShell>
  );
}
