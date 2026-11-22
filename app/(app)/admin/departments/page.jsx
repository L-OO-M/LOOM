import { scope } from "@/lib/tenant-scope";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Archive, Plus } from "lucide-react";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { roleRank } from "@/lib/permissions";
import { syncLeadershipScopedGrant } from "@/lib/scoped-grants";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { DepartmentCard } from "./_components/DepartmentCard";
import { DeptSizeBars, VerticalSplitDonut } from "@/components/admin/RemainingCharts";
import "../_components/admin-ledger.css";

function oneYearFromNow() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Release a person's department seat only if they no longer hold either slot.
 * Downgrades that membership, revokes the department grant, ends the term and
 * demotes the global label only when no other department seat remains — so a
 * Head of two departments is never demoted for losing one.
 */
async function releaseDepartmentSeat(tx, { tenantId, actorId, userId, departmentId }) {
  const [dept] = await tx`
    SELECT head_user_id, co_head_user_id FROM departments
    WHERE id = ${departmentId} AND tenant_id = ${tenantId}::uuid
  `;
  if (!dept) return false;
  if (dept.head_user_id === userId || dept.co_head_user_id === userId) return false;

  await tx`
    UPDATE department_memberships
    SET level = 'core', term_end = COALESCE(term_end, CURRENT_DATE)
    WHERE user_id = ${userId} AND department_id = ${departmentId}
  `;
  await tx`
    UPDATE scoped_role_grants
    SET is_active = false, revoked_at = COALESCE(revoked_at, now()),
        revoked_by = COALESCE(revoked_by, ${actorId}),
        revocation_reason = COALESCE(revocation_reason, 'head_vacated')
    WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}
      AND role_name = 'dept_lead' AND scope_type = 'department'
      AND scope_id = ${String(departmentId)} AND is_active = true AND revoked_at IS NULL
  `;
  await tx`
    UPDATE leadership_terms SET status = 'ended', ended_reason = 'head_vacated'
    WHERE user_id = ${userId} AND status = 'active'
      AND role = 'dept_lead' AND department_id = ${departmentId}
  `;
  const [other] = await tx`
    SELECT 1 AS present FROM department_memberships
    WHERE user_id = ${userId} AND department_id <> ${departmentId}
      AND level = 'dept_lead' AND (term_end IS NULL OR term_end >= CURRENT_DATE)
    LIMIT 1
  `;
  if (!other) {
    await tx`
      UPDATE profiles SET role = 'core', role_term_end = NULL, updated_at = NOW()
      WHERE user_id = ${userId} AND tenant_id = ${tenantId}::uuid AND role = 'dept_lead'
    `;
  }
  return true;
}

/**
 * Appoint a member as Head or Co-Head of exactly one department.
 *
 * The department slot, the membership level, the profile role label, the
 * leadership term and the scoped grant move together so a half-appointed Head
 * can never exist. Role promotion is upward-only: a Vertical Lead or Super
 * Admin keeps their global role and only gains this department seat.
 */
async function appointHead(formData) {
  "use server";
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return;
  const { sql, user, tenant } = ctx;
  const deptId = String(formData.get("departmentId") || "");
  const userId = String(formData.get("userId") || "");
  const slot = String(formData.get("slot") || "head");
  if (!userId || !["head", "co_head"].includes(slot) || userId === user.id) return;

  const tid = scope(tenant?.id ?? null);
  const [dept] = await sql`
    SELECT id, name, slug, head_user_id, co_head_user_id FROM departments
    WHERE id = ${deptId} AND tenant_id = ${tid}::uuid LIMIT 1
  `;
  if (!dept) return;
  if (slot === "co_head" && userId === dept.head_user_id) return;

  const [target] = await sql`
    SELECT user_id, role FROM profiles
    WHERE user_id = ${userId} AND tenant_id = ${tid}::uuid LIMIT 1
  `;
  if (!target) return;
  const [founder] = await sql`SELECT 1 AS present FROM platform_admins WHERE user_id = ${userId} LIMIT 1`;
  const promote = !founder && roleRank(target.role) < roleRank("dept_lead");
  const startsOn = new Date().toISOString().slice(0, 10);
  const endsOn = oneYearFromNow();
  const label = slot === "head" ? "Head" : "Co-Head";

  await sql.begin(async (tx) => {
    await tx`
      UPDATE departments
      SET head_user_id = CASE WHEN ${slot} = 'head' THEN ${userId} ELSE head_user_id END,
          co_head_user_id = CASE WHEN ${slot} = 'co_head' THEN ${userId}
                                 WHEN ${slot} = 'head' AND co_head_user_id = ${userId} THEN NULL
                                 ELSE co_head_user_id END
      WHERE id = ${dept.id} AND tenant_id = ${tid}::uuid
    `;
    await tx`
      INSERT INTO department_memberships
        (user_id, department_id, level, core_requested, term_start, term_end, tenant_id)
      VALUES (${userId}, ${dept.id}, 'dept_lead', false, ${startsOn}, ${endsOn},
              (SELECT tenant_id FROM departments WHERE id = ${dept.id}))
      ON CONFLICT (user_id, department_id) DO UPDATE
        SET level = 'dept_lead', core_requested = false,
            term_start = EXCLUDED.term_start, term_end = EXCLUDED.term_end
    `;
    if (promote) {
      await tx`
        UPDATE profiles SET role = 'dept_lead', vertical = NULL,
          role_term_start = ${startsOn}, role_term_end = ${endsOn}, updated_at = NOW()
        WHERE user_id = ${userId} AND tenant_id = ${tid}::uuid
      `;
      await tx`
        UPDATE leadership_terms SET status = 'ended', ended_reason = 'role_changed'
        WHERE user_id = ${userId} AND status = 'active'
      `;
      await tx`
        INSERT INTO leadership_terms
          (tenant_id, user_id, role, department_id, starts_on, ends_on, appointed_by)
        VALUES (${tenant?.id ?? null}, ${userId}, 'dept_lead', ${dept.id},
                ${startsOn}, ${endsOn}, ${user.id})
      `;
    }
    if (tenant?.id) {
      await syncLeadershipScopedGrant(tx, {
        tenantId: tenant.id,
        userId,
        actorId: user.id,
        role: "dept_lead",
        departmentId: dept.id,
        startsAt: startsOn,
        expiresAt: endsOn,
        // A promotion replaces the old label; an existing leader only gains this seat.
        revokeAllLeadership: promote,
        reason: "head_appointed"
      });
    }
    // Replacing a seat releases the previous occupant — but only if they no
    // longer hold the other slot, so promoting a Co-Head keeps their seat.
    const previous = slot === "head" ? dept.head_user_id : dept.co_head_user_id;
    if (previous && previous !== userId) {
      await releaseDepartmentSeat(tx, {
        tenantId: tenant?.id,
        actorId: user.id,
        userId: previous,
        departmentId: dept.id
      });
    }
    await writeAudit({
      sql: tx, actorId: user.id, tenantId: tenant?.id,
      action: "appointed_department_head", resource: "department", resourceId: dept.id,
      before: { headUserId: dept.head_user_id, coHeadUserId: dept.co_head_user_id },
      after: { slot, userId, slug: dept.slug, promoted: promote }
    });
    try {
      await notify({
        sql: tx, tenantId: tenant?.id, userId, type: "role_granted",
        title: `You are now ${label} of ${dept.name}`,
        body: "Open the Lead console to run this department's roster, tasks and calendar.",
        link: "/lead"
      });
    } catch {}
  });
  revalidatePath("/admin/departments");
}

/** Vacate one leadership seat without touching the person's other departments. */
async function vacateHead(formData) {
  "use server";
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return;
  const { sql, user, tenant } = ctx;
  const deptId = String(formData.get("departmentId") || "");
  const slot = String(formData.get("slot") || "");
  if (!["head", "co_head"].includes(slot)) return;

  const tid = scope(tenant?.id ?? null);
  const [dept] = await sql`
    SELECT id, name, slug, head_user_id, co_head_user_id FROM departments
    WHERE id = ${deptId} AND tenant_id = ${tid}::uuid LIMIT 1
  `;
  if (!dept) return;
  const userId = slot === "head" ? dept.head_user_id : dept.co_head_user_id;
  if (!userId) return;

  await sql.begin(async (tx) => {
    await tx`
      UPDATE departments
      SET head_user_id = CASE WHEN ${slot} = 'head' THEN NULL ELSE head_user_id END,
          co_head_user_id = CASE WHEN ${slot} = 'co_head' THEN NULL ELSE co_head_user_id END
      WHERE id = ${dept.id} AND tenant_id = ${tid}::uuid
    `;
    await releaseDepartmentSeat(tx, {
      tenantId: tenant?.id,
      actorId: user.id,
      userId,
      departmentId: dept.id
    });
    await writeAudit({
      sql: tx, actorId: user.id, tenantId: tenant?.id,
      action: "vacated_department_head", resource: "department", resourceId: dept.id,
      before: { slot, userId }, after: { slug: dept.slug }
    });
    try {
      await notify({
        sql: tx, tenantId: tenant?.id, userId, type: "role_changed",
        title: `Your ${slot === "head" ? "Head" : "Co-Head"} seat in ${dept.name} was vacated`,
        body: "Your work history stays on record.",
        link: "/student"
      });
    } catch {}
  });
  revalidatePath("/admin/departments");
}

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
      WHERE id = ${id} AND tenant_id = ${scope(tenant?.id ?? null)}::uuid
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
      d.head_user_id, d.co_head_user_id,
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
    WHERE d.tenant_id = ${scope(tid)}::uuid
    ORDER BY d.is_active DESC, d.vertical, d.name
  `;

  // Roster per department, used by the Head / Co-Head pickers. Only people who
  // can take the seat without losing a wider role are offered in the UI.
  const roster = await sql`
    SELECT m.department_id, m.user_id, m.level, p.name, p.role
    FROM department_memberships m
    JOIN profiles p ON p.user_id = m.user_id
    WHERE m.tenant_id = ${scope(tid)}::uuid
    ORDER BY p.name
  `;
  const membersByDept = roster.reduce((acc, row) => {
    (acc[row.department_id] ||= []).push(row);
    return acc;
  }, {});

  const totalMembers = departments.reduce((s, d) => s + (d.members || 0), 0);
  const active = departments.filter((d) => d.is_active);
  const archived = departments.filter((d) => !d.is_active);

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Organization / ${departments.length} total / ${active.length} active`}
          title="Departments"
          lede="Create, rename, and archive departments. Each department has its own Head and Co-Head — open Edit on a department to appoint them from its members."
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

        <WorkspaceSection index="02" title="Active departments" note={`${active.length} active / ${archived.length} archived / technical first, then non-technical. Head and Co-Head are appointed per department.`}>
          {active.length === 0 && archived.length === 0 ? (
            <WorkspaceEmpty
              title="No departments yet"
              body="Start with your technical verticals — each department owns a roadmap, a calendar, and a Head."
            />
          ) : (
            <ul className="aled-dept-grid">
              {active.map((d) => (
                <DepartmentCard
                  key={d.id}
                  dept={d}
                  members={membersByDept[d.id] || []}
                  action={saveDepartment}
                  appointAction={appointHead}
                  vacateAction={vacateHead}
                />
              ))}
            </ul>
          )}
          {archived.length > 0 && (
            <details className="mt-6 border-t" style={{ borderColor: "var(--line)" }}>
              <summary className="flex cursor-pointer items-center gap-2 py-3 text-sm font-medium marker:hidden" style={{ color: "var(--text)" }}>
                <Archive size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" /> Archived / {archived.length}
                <span className="aled-meta ml-auto">click to expand</span>
              </summary>
              <ul className="aled-dept-grid" style={{ borderTop: "1px solid var(--line)" }}>
                {archived.map((d) => (
                  <DepartmentCard
                    key={d.id}
                    dept={d}
                    members={membersByDept[d.id] || []}
                    action={saveDepartment}
                    appointAction={appointHead}
                    vacateAction={vacateHead}
                  />
                ))}
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
