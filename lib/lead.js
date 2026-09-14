import { isAdmin } from "@/lib/permissions";

/**
 * Lead console data in one place, shared by GET /api/lead/overview and
 * app/(app)/lead/page.jsx. Dept leads see led departments; vertical leads
 * see their vertical plus calendar/approvals; admins see everything.
 */
export async function getLeadOverview(sql, { userId, profile, tenant, verticalOverride = null }) {
  const admin = isAdmin({ role: profile.role });
  const memberships = profile.memberships || [];
  const tid = tenant?.id ?? null;
  const vertical = profile.vertical || verticalOverride || "technical";
  const scopeVertical = profile.role === "vertical_lead" && !admin ? profile.vertical : vertical;

  const ledIds = memberships.filter((m) => m.level === "dept_lead").map((m) => m.department_id);
  const deptFilter = admin
    ? sql`TRUE`
    : profile.role === "vertical_lead"
      ? sql`d.vertical = ${scopeVertical}`
      : sql`d.id = ANY(${ledIds})`;

  const departments = await sql`
    SELECT d.id, d.name, d.slug, d.vertical,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members
    FROM departments d
    WHERE d.is_active AND (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AND ${deptFilter}
    ORDER BY d.name
  `;
  const deptIds = departments.map((d) => d.id);
  const roster = deptIds.length ? await sql`
    SELECT m.department_id, m.level, m.core_requested, m.succession_ready, m.joined_at,
      p.user_id, p.name, p.year, p.github_username
    FROM department_memberships m JOIN profiles p ON p.user_id = m.user_id
    WHERE m.department_id = ANY(${deptIds})
    ORDER BY m.level DESC, p.name ASC
    LIMIT 300
  ` : [];

  const workshops = deptIds.length ? await sql`
    SELECT e.id, e.title, e.event_type, e.starts_at, e.status, e.department_id, d.name AS department_name
    FROM events e LEFT JOIN departments d ON d.id = e.department_id
    WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND e.starts_at >= NOW() - INTERVAL '2 hours' AND e.status <> 'cancelled'
      AND (e.department_id = ANY(${deptIds}) OR ${admin || profile.role === "vertical_lead" ? sql`TRUE` : sql`FALSE`})
    ORDER BY e.starts_at ASC LIMIT 20
  ` : [];

  const proposed = (admin || profile.role === "vertical_lead") ? await sql`
    SELECT e.id, e.title, e.event_type, e.starts_at, e.description, p.name AS author_name
    FROM events e LEFT JOIN profiles p ON p.user_id = e.created_by
    WHERE e.status = 'proposed' AND (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY e.created_at ASC LIMIT 20
  ` : [];

  const recentLogs = deptIds.length ? await sql`
    SELECT c.id, c.title, c.kind, c.created_at, c.student_id, lp.name AS student_name
    FROM member_contributions c LEFT JOIN profiles lp ON lp.user_id = c.student_id
    WHERE c.department_id = ANY(${deptIds})
    ORDER BY c.created_at DESC LIMIT 15
  ` : [];

  const calEvents = (admin || profile.role === "vertical_lead") ? await sql`
    SELECT e.id, e.title, e.starts_at, e.ends_at, d.name AS department_name
    FROM events e LEFT JOIN departments d ON d.id = e.department_id
    WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND e.starts_at >= NOW() AND e.status = 'upcoming'
      AND (${admin ? sql`TRUE` : sql`(d.vertical = ${scopeVertical} OR e.department_id IS NULL)`})
    ORDER BY e.starts_at ASC LIMIT 40
  ` : [];
  const conflicts = [];
  for (let i = 0; i < calEvents.length; i++) {
    for (let j = i + 1; j < calEvents.length; j++) {
      const a = calEvents[i], b = calEvents[j];
      const aEnd = new Date(a.ends_at || new Date(new Date(a.starts_at).getTime() + 2 * 3600 * 1000));
      if (new Date(b.starts_at) < aEnd) conflicts.push({ a: { id: a.id, title: a.title }, b: { id: b.id, title: b.title } });
      else break;
    }
  }

  return {
    role: admin && profile.role === "admin" ? "admin" : profile.role,
    departments, roster, workshops, proposed, recentLogs,
    calendar: profile.role === "dept_lead" && !admin ? [] : calEvents,
    conflicts, myLedIds: ledIds, userId
  };
}
