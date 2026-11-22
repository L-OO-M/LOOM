/**
 * Department workspace — the aggregated view of one department's work.
 *
 * The Lead console is a *person's* view (my departments, my decisions). This
 * module answers the other question: what does Department X actually own right
 * now — who is in it, what it has scheduled, what is late, what it has
 * recorded, and what it has spent.
 *
 * Every query takes a tenantId and a departmentId resolved server-side. The
 * page calls these after `can()` decides which modules the viewer may see;
 * nothing here does authorization. Queries are sequential on purpose: the
 * pooled connection is limited (lib/db.js max 10) and AGENTS.md forbids
 * Promise.all batching on page loads.
 */
import { DEPARTMENT_CATALOG } from "./department-catalog.js";
import { hasVerticalLeadGrant, isAdmin, termExpired } from "./permissions.js";
import { listDepartmentTasks } from "./department-tasks.js";
import { memberProgress } from "./member-progress.js";

/** True when `profile` is allowed to open this department's workspace. */
export function canViewDepartment(profile, department) {
  if (!profile || !department) return false;
  if (isAdmin(profile)) return true;
  if (profile.role === "vertical_lead") {
    return hasVerticalLeadGrant({
      ...profile,
      tenantId: profile.tenant_id ?? profile.tenantId
    }, department.vertical);
  }
  return (profile.memberships || []).some((membership) =>
    membership.department_id === department.id &&
    membership.level === "dept_lead" &&
    !termExpired(membership.term_end)
  );
}

/**
 * Departments this person may open. Admins see everything; a vertical lead
 * sees their vertical; a department head sees the departments they belong to.
 * The catalogue order is preserved so the list does not reshuffle between
 * people.
 */
export function departmentsForProfile(profile, rows) {
  if (!profile) return [];
  if (isAdmin(profile)) return rows;
  if (profile.role === "vertical_lead") {
    return rows.filter((d) => hasVerticalLeadGrant({
      ...profile,
      tenantId: profile.tenant_id ?? profile.tenantId
    }, d.vertical));
  }
  const mine = new Set((profile.memberships || [])
    .filter((membership) =>
      membership.level === "dept_lead" && !termExpired(membership.term_end)
    )
    .map((membership) => membership.department_id));
  return rows.filter((d) => mine.has(d.id));
}

/** Departments in a tenant with the counts the index cards need. */
export async function listWorkspaceDepartments(sql, tenantId) {
  return sql`
    SELECT d.id, d.name, d.slug, d.vertical, d.description, d.is_active,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members,
      (SELECT COUNT(*)::int FROM events e
        WHERE e.department_id = d.id AND e.status IN ('published', 'registration_closed', 'live', 'upcoming')
          AND e.starts_at >= NOW()) AS upcoming_events,
      (SELECT COUNT(*)::int FROM event_ops_tasks t
        JOIN events e ON e.id = t.event_id
        WHERE e.department_id = d.id AND t.is_active AND t.status <> 'done') AS open_tasks,
      (SELECT COUNT(*)::int FROM department_tasks t
        WHERE t.department_id = d.id AND t.is_active AND t.status <> 'done') AS open_work,
      (SELECT MAX(r.month) FROM dept_reports r WHERE r.department_id = d.id) AS latest_report
    FROM departments d
    WHERE d.tenant_id = ${tenantId}::uuid AND d.is_active
    ORDER BY d.vertical, d.name
  `;
}

/** Stable catalogue position so the workspace can show "Department 04 of 13". */
export function catalogueIndex(slug) {
  const index = DEPARTMENT_CATALOG.findIndex((d) => d.slug === slug);
  return index < 0 ? null : index + 1;
}

export async function getDepartmentWorkspace(sql, { tenantId, department }) {
  const departmentId = department.id;
  const today = new Date().toISOString().slice(0, 10);

  const heads = await sql`
    SELECT m.user_id, m.level, m.term_end, p.name, up.avatar_url
    FROM department_memberships m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    LEFT JOIN user_profiles up ON up.user_id = m.user_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND m.department_id = ${departmentId}::uuid
      AND m.level = 'dept_lead'
      AND (m.term_end IS NULL OR m.term_end >= ${today}::date)
    ORDER BY m.joined_at ASC
    LIMIT 2
  `;

  const members = await sql`
    SELECT m.user_id, m.level, m.core_requested, m.succession_ready, m.joined_at,
           p.name, p.github_username
    FROM department_memberships m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE m.tenant_id = ${tenantId}::uuid
      AND m.department_id = ${departmentId}::uuid
    ORDER BY
      CASE m.level WHEN 'dept_lead' THEN 0 WHEN 'core' THEN 1 ELSE 2 END,
      p.name ASC
    LIMIT 200
  `;

  // The roster is a progress list, not just a name list: a head has to be able
  // to see who is moving and who has gone quiet before deciding on Core. One
  // batched call for the whole department, never one per member.
  const progress = await memberProgress(sql, {
    tenantId,
    userIds: members.map((m) => m.user_id)
  });
  const membersWithProgress = members.map((m) => ({
    ...m,
    progress: progress.get(String(m.user_id)) || null
  }));

  const events = await sql`
    SELECT e.id, e.title, e.event_type, e.starts_at, e.status,
           e.capacity, e.registered_count
    FROM events e
    WHERE e.tenant_id = ${tenantId}::uuid
      AND e.department_id = ${departmentId}::uuid
      AND e.status <> 'cancelled'
    ORDER BY e.starts_at DESC
    LIMIT 12
  `;

  const tasks = await sql`
    SELECT t.id, t.title, t.status, t.priority, t.due_at, e.title AS event_title
    FROM event_ops_tasks t
    JOIN events e ON e.id = t.event_id
    WHERE t.tenant_id = ${tenantId}::uuid
      AND e.department_id = ${departmentId}::uuid
      AND t.is_active
    ORDER BY (t.status = 'done'), t.due_at ASC NULLS LAST
    LIMIT 24
  `;

  // The department's own work board. Same row shape the API returns, so the
  // client can replace a task with a PATCH response without reshaping it.
  const departmentTasks = await listDepartmentTasks(sql, { tenantId, departmentId });

  const reports = await sql`
    SELECT r.id, r.month, r.status, r.created_at, r.submitted_at
    FROM dept_reports r
    WHERE r.tenant_id = ${tenantId}::uuid
      AND r.department_id = ${departmentId}::uuid
    ORDER BY r.month DESC
    LIMIT 6
  `;

  const contributions = await sql`
    SELECT c.id, c.title, c.kind, c.created_at, p.name AS student_name
    FROM member_contributions c
    LEFT JOIN profiles p ON p.user_id = c.student_id
    WHERE c.tenant_id = ${tenantId}::uuid
      AND c.department_id = ${departmentId}::uuid
    ORDER BY c.created_at DESC
    LIMIT 12
  `;

  // Assets explicitly owned by the department, plus the society-wide library
  // (department_id IS NULL) that every team is expected to reuse.
  const assets = await sql`
    SELECT a.id, a.title, a.kind, a.external_url, a.created_at, a.department_id
    FROM media_assets a
    WHERE a.tenant_id = ${tenantId}::uuid
      AND a.is_active
      AND (a.department_id = ${departmentId}::uuid OR a.department_id IS NULL)
    ORDER BY a.created_at DESC
    LIMIT 12
  `;

  const expenses = await sql`
    SELECT id, amount, note, status, created_at
    FROM expenses
    WHERE tenant_id = ${tenantId}::uuid
      AND department_id = ${departmentId}::uuid
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const allocations = await sql`
    SELECT name, allocated
    FROM budget_heads
    WHERE tenant_id = ${tenantId}::uuid
      AND department_id = ${departmentId}::uuid
    ORDER BY name
    LIMIT 10
  `;

  // MoUs are vertical-scoped in the schema, so a department sees the agreements
  // negotiated for its vertical — never another vertical's.
  const mous = await sql`
    SELECT id, title, partner_name, status, ends_on
    FROM mous
    WHERE tenant_id = ${tenantId}::uuid
      AND is_active
      AND vertical = ${department.vertical}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const directory = await sql`
    SELECT id, name, title, is_current, photo_url, tenure_end
    FROM lead_directory
    WHERE tenant_id = ${tenantId}::uuid
      AND department_id = ${departmentId}::uuid
      AND is_active
    ORDER BY is_current DESC, sort_order, name
    LIMIT 20
  `;

  const spent = expenses
    .filter((e) => e.status === "approved" || e.status === "paid")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const allocated = allocations.reduce((sum, b) => sum + Number(b.allocated || 0), 0);

  return {
    heads,
    members: membersWithProgress,
    events,
    tasks,
    departmentTasks,
    reports,
    contributions,
    assets,
    expenses,
    allocations,
    mous,
    directory,
    counts: {
      members: members.length,
      heads: heads.length,
      upcoming: events.filter((e) => ["published", "registration_closed", "live", "upcoming"].includes(e.status)).length,
      openTasks: tasks.filter((t) => t.status !== "done").length,
      openWork: departmentTasks.filter((t) => t.status !== "done").length,
      awaitingReview: departmentTasks.filter((t) => t.status === "submitted").length,
      contributions: contributions.length,
      spent,
      allocated
    }
  };
}
