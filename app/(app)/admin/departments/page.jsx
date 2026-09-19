import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Building2, Users, Archive, Sparkles, Plus } from "lucide-react";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { DepartmentCard } from "./_components/DepartmentCard";
import { DeptSizeBars, VerticalSplitDonut } from "@/components/admin/RemainingCharts";

async function saveDepartment(formData) {
  "use server";
  const ctx = await getRequestContext();
  if (ctx.error || ctx.profile.role !== "admin") return;
  const { sql, user, tenant } = ctx;
  const id = String(formData.get("id") || "") || null;
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const rawSlug = String(formData.get("slug") || "").trim();
  const slug = rawSlug ? rawSlug.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60) : name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60);
  const vertical = String(formData.get("vertical") || "technical");
  const description = String(formData.get("description") || "").trim().slice(0, 1000);
  const isActive = formData.get("isActive") === "on";
  if (name.length < 2 || slug.length < 2 || !["technical", "non_technical"].includes(vertical)) return;
  if (id) {
    await sql`
      UPDATE departments SET name = ${name}, description = ${description},
        vertical = ${vertical}, is_active = ${isActive}
      WHERE id = ${id} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    `;
    await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_department", resource: "department", resourceId: id, after: { name, isActive } });
  } else {
    const [row] = await sql`
      INSERT INTO departments (tenant_id, name, slug, vertical, description, is_active)
      VALUES (${tenant?.id ?? null}, ${name}, ${slug}, ${vertical}, ${description}, ${isActive})
      ON CONFLICT DO NOTHING
      RETURNING *
    `.catch(() => []);
    if (row) {
      await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "created_department", resource: "department", resourceId: row.id, after: { name, slug } });
    }
  }
  revalidatePath("/admin/departments");
}

export default async function AdminDepartmentsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/departments");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/departments");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const departments = await sql`
    SELECT d.id, d.name, d.slug, d.vertical, d.description, d.is_active,
      hp.name AS head_name, cp.name AS co_head_name,
      COALESCE(m.members, 0)::int AS members,
      c.last_activity AS last_activity
    FROM departments d
    LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
    LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
    LEFT JOIN (
      SELECT department_id, COUNT(*)::int AS members
      FROM department_memberships GROUP BY department_id
    ) m ON m.department_id = d.id
    LEFT JOIN (
      SELECT department_id, MAX(created_at) AS last_activity
      FROM member_contributions GROUP BY department_id
    ) c ON c.department_id = d.id
    WHERE (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY d.is_active DESC, d.vertical, d.name
  `;

  const totalMembers = departments.reduce((s, d) => s + (d.members || 0), 0);
  const active = departments.filter((d) => d.is_active);
  const archived = departments.filter((d) => !d.is_active);

  const input = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";
  const inputStyle = { borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" };

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Organization · ${departments.length} total · ${active.length} active`} title="Departments" desc="Create, rename, and archive departments. Heads are assigned from the roster — a role grant creates the membership." />

        {/* Stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Departments", value: departments.length, icon: Building2 },
            { label: "Active", value: active.length, icon: Sparkles },
            { label: "Members", value: totalMembers, icon: Users },
            { label: "Avg / dept", value: departments.length ? Math.round(totalMembers / departments.length) : 0, icon: Users },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label}</p></div>
            </div>
          ))}
        </div>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="Dept visuals">
          <DeptSizeBars data={departments.slice(0, 6).map((d) => ({ name: d.name, value: d.members }))} />
          <VerticalSplitDonut data={[
            { name: "Technical", value: departments.filter((d) => d.vertical === "technical").length },
            { name: "Non-technical", value: departments.filter((d) => d.vertical === "non_technical").length },
          ]} />
        </section>

        <section aria-label="Active departments">
          <div className="flex items-baseline gap-2">
            <Meta>{active.length} active · {archived.length} archived</Meta>
            <span className="meta">· technical first, then non-technical</span>
          </div>
          {active.length === 0 && archived.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No departments yet</p>
              <p className="narrative mx-auto mt-2 max-w-md">Start with your technical verticals — each department owns a roadmap, a calendar, and a Head.</p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {active.map((d) => <DepartmentCard key={d.id} dept={d} action={saveDepartment} />)}
            </ul>
          )}
          {archived.length > 0 && (
            <details className="mt-6 rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-medium marker:hidden" style={{ color: "var(--text)" }}>
                <Archive size={14} style={{ color: "var(--text-muted)" }} /> Archived · {archived.length}
                <span className="meta ml-auto">click to expand</span>
              </summary>
              <ul className="grid gap-3 border-t p-3 sm:grid-cols-2" style={{ borderColor: "var(--line)" }}>
                {archived.map((d) => <DepartmentCard key={d.id} dept={d} action={saveDepartment} />)}
              </ul>
            </details>
          )}
        </section>

        <section className="mt-8" aria-label="Create department">
          <div className="flex items-center gap-2">
            <Plus size={14} style={{ color: "var(--accent)" }} />
            <Meta>New department</Meta>
          </div>
          <form action={saveDepartment} className="mt-3 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Name
              <input name="name" required minLength={2} maxLength={120} placeholder="Robotics" className={input} style={{ ...inputStyle, marginTop: 6 }} />
            </label>
            <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Slug <span className="font-normal" style={{ color: "var(--text-muted)" }}>· auto from name if blank</span>
              <input name="slug" maxLength={60} placeholder="robotics" className={input} style={{ ...inputStyle, marginTop: 6 }} />
            </label>
            <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Vertical
              <select name="vertical" className={input} style={{ ...inputStyle, marginTop: 6 }}>
                <option value="technical">Technical</option>
                <option value="non_technical">Non-technical</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text)" }}>
              <input type="checkbox" name="isActive" defaultChecked className="rounded" /> Active immediately
            </label>
            <label className="text-xs font-medium sm:col-span-2" style={{ color: "var(--text)" }}>Description
              <input name="description" maxLength={1000} placeholder="What this department owns — shown on /domains and inside the app" className={input} style={{ ...inputStyle, marginTop: 6 }} />
            </label>
            <button className="btn-ink inline-flex items-center justify-center gap-1.5 sm:col-span-2"><Plus size={14} /> Create department</button>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
