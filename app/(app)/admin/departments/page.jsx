import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";

async function saveDepartment(formData) {
  "use server";
  const ctx = await getRequestContext();
  if (ctx.error || ctx.profile.role !== "admin") return;
  const { sql, user, tenant } = ctx;
  const id = String(formData.get("id") || "") || null;
  const name = String(formData.get("name") || "").slice(0, 120);
  const slug = String(formData.get("slug") || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60);
  const vertical = String(formData.get("vertical") || "technical");
  const description = String(formData.get("description") || "").slice(0, 1000);
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
    SELECT d.*,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members
    FROM departments d
    WHERE (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY d.vertical, d.name
  `;
  const input = { borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, width: "100%" };

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Organization" title="Departments" desc="Create, rename, and archive departments. Heads are assigned from the roster — membership grants it." />
        <section className="mt-8" aria-label="All departments">
          <Meta>{departments.length} department{departments.length === 1 ? "" : "s"}</Meta>
          <ul className="mt-3 space-y-3">
            {departments.map((d) => (
              <li key={d.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", opacity: d.is_active ? 1 : 0.6 }}>
                <form action={saveDepartment} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <input type="hidden" name="id" value={d.id} />
                  <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Name
                    <input name="name" defaultValue={d.name} required minLength={2} maxLength={120} style={{ ...input, marginTop: 6 }} />
                  </label>
                  <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Vertical
                    <select name="vertical" defaultValue={d.vertical} style={{ ...input, marginTop: 6 }}>
                      <option value="technical">Technical</option>
                      <option value="non_technical">Non-technical</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                    <input type="checkbox" name="isActive" defaultChecked={d.is_active} /> Active
                  </label>
                  <label className="text-xs font-semibold sm:col-span-2" style={{ color: "var(--text-muted)" }}>Description
                    <input name="description" defaultValue={d.description} maxLength={1000} style={{ ...input, marginTop: 6 }} />
                  </label>
                  <span className="meta">slug: {d.slug} · {d.members} members</span>
                  <button className="btn-ink !py-2 text-sm sm:col-start-3">Save</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-8" aria-label="Create department">
          <Meta>New department</Meta>
          <form action={saveDepartment} className="mt-3 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Name
              <input name="name" required minLength={2} maxLength={120} placeholder="Robotics" style={{ ...input, marginTop: 6 }} />
            </label>
            <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Slug
              <input name="slug" required minLength={2} maxLength={60} placeholder="robotics" style={{ ...input, marginTop: 6 }} />
            </label>
            <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Vertical
              <select name="vertical" style={{ ...input, marginTop: 6 }}>
                <option value="technical">Technical</option>
                <option value="non_technical">Non-technical</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" name="isActive" defaultChecked /> Active immediately
            </label>
            <label className="text-xs font-semibold sm:col-span-2" style={{ color: "var(--text-muted)" }}>Description
              <input name="description" maxLength={1000} placeholder="What this department owns" style={{ ...input, marginTop: 6 }} />
            </label>
            <button className="btn-ink justify-center sm:col-span-2">Create department</button>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
