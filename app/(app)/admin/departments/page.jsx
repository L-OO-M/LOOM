import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Archive, Plus } from "lucide-react";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { DepartmentCard } from "./_components/DepartmentCard";
import { DeptSizeBars, VerticalSplitDonut } from "@/components/admin/RemainingCharts";
import "../_components/admin-ledger.css";

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

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Organization / ${departments.length} total / ${active.length} active`}
          title="Departments"
          lede="Create, rename, and archive departments. Heads are assigned from the roster — a role grant creates the membership."
          meta={`${active.length} active / ${archived.length} archived / ${totalMembers} members across the chapter`}
          tone="field"
          art="/domains-art/domain-infra.png"
          artAlt=""
          stats={[
            { value: departments.length, label: "departments" },
            { value: active.length, label: "active now" },
            { value: totalMembers, label: "members total" },
            { value: departments.length ? Math.round(totalMembers / departments.length) : 0, label: "avg members / dept" }
          ]}
        />

        <WorkspaceSection index="01" title="Shape of the org" note="Department size and the technical / non-technical split.">
          <div className="adminx-chart-grid">
            <div className="adminx-chart"><DeptSizeBars data={departments.slice(0, 6).map((d) => ({ name: d.name, value: d.members }))} /></div>
            <div className="adminx-chart">
              <VerticalSplitDonut data={[
                { name: "Technical", value: departments.filter((d) => d.vertical === "technical").length },
                { name: "Non-technical", value: departments.filter((d) => d.vertical === "non_technical").length },
              ]} />
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Active departments" note={`${active.length} active / ${archived.length} archived / technical first, then non-technical`}>
          {active.length === 0 && archived.length === 0 ? (
            <WorkspaceEmpty
              title="No departments yet"
              body="Start with your technical verticals — each department owns a roadmap, a calendar, and a Head."
            />
          ) : (
            <ul className="aled-dept-grid">
              {active.map((d) => <DepartmentCard key={d.id} dept={d} action={saveDepartment} />)}
            </ul>
          )}
          {archived.length > 0 && (
            <details className="mt-6 border-t" style={{ borderColor: "var(--line)" }}>
              <summary className="flex cursor-pointer items-center gap-2 py-3 text-sm font-medium marker:hidden" style={{ color: "var(--text)" }}>
                <Archive size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" /> Archived / {archived.length}
                <span className="aled-meta ml-auto">click to expand</span>
              </summary>
              <ul className="aled-dept-grid" style={{ borderTop: "1px solid var(--line)" }}>
                {archived.map((d) => <DepartmentCard key={d.id} dept={d} action={saveDepartment} />)}
              </ul>
            </details>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="03" title="New department" note="Slug is generated from the name when left blank. Active departments are visible to students and joinable.">
          <form action={saveDepartment} className="aled-form max-w-3xl sm:grid-cols-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))" }}>
            <label>Name
              <input name="name" required minLength={2} maxLength={120} placeholder="Robotics" className="aled-field" />
            </label>
            <label>Slug / auto from name if blank
              <input name="slug" maxLength={60} placeholder="robotics" className="aled-field" />
            </label>
            <label>Vertical
              <select name="vertical" className="aled-field">
                <option value="technical">Technical</option>
                <option value="non_technical">Non-technical</option>
              </select>
            </label>
            <label className="is-inline" style={{ alignSelf: "end" }}>
              <input type="checkbox" name="isActive" defaultChecked /> Active immediately
            </label>
            <label style={{ gridColumn: "1 / -1" }}>Description
              <input name="description" maxLength={1000} placeholder="What this department owns — shown on /domains and inside the app" className="aled-field" />
            </label>
            <button className="btn-ink inline-flex items-center justify-center gap-1.5" style={{ gridColumn: "1 / -1" }}><Plus size={14} aria-hidden="true" /> Create department</button>
          </form>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
