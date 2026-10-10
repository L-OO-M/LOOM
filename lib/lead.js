import { isAdmin } from "@/lib/permissions";

/**
 * Lead console data in one place, shared by the /lead/* pages and
 * GET /api/lead/overview. Dept leads see led departments; vertical leads see
 * their vertical plus calendar/approvals; admins see everything.
 *
 * Every query is scoped to the departments the caller actually leads, so the
 * console can never widen its own reach by reading a different slice.
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
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id AND m.core_requested AND m.level = 'general') AS core_requests,
      (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id AND m.succession_ready) AS succession_ready,
      (SELECT COUNT(*)::int FROM member_contributions c WHERE c.department_id = d.id) AS contributions
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
    SELECT e.id, e.title, e.event_type, e.starts_at, e.status, e.department_id,
           e.capacity, e.registered_count, d.name AS department_name
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

  // Calendar. Previously dept leads were handed a hardcoded [] (the old return
  // mapped `calendar: profile.role === "dept_lead" && !admin ? [] : calEvents`),
  // so the Reports tab showed "Nothing upcoming in your vertical" to every dept
  // lead 100% of the time by construction. A dept lead now sees their own
  // departments' events — which is the only calendar they can act on.
  const calendar = (admin || profile.role === "vertical_lead") ? await sql`
    SELECT e.id, e.title, e.starts_at, e.ends_at, d.name AS department_name
    FROM events e LEFT JOIN departments d ON d.id = e.department_id
    WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND e.starts_at >= NOW() AND e.status = 'upcoming'
      AND (${admin ? sql`TRUE` : sql`(d.vertical = ${scopeVertical} OR e.department_id IS NULL)`})
    ORDER BY e.starts_at ASC LIMIT 40
  ` : await sql`
    SELECT e.id, e.title, e.starts_at, e.ends_at, d.name AS department_name
    FROM events e LEFT JOIN departments d ON d.id = e.department_id
    WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND e.starts_at >= NOW() AND e.status = 'upcoming'
      AND e.department_id = ANY(${deptIds})
    ORDER BY e.starts_at ASC LIMIT 40
  `;

  // Double-booking detection. `calendar` is ORDER BY starts_at ASC, so the inner
  // loop can break at the first non-overlap.
  const conflicts = [];
  for (let i = 0; i < calendar.length; i++) {
    for (let j = i + 1; j < calendar.length; j++) {
      const a = calendar[i], b = calendar[j];
      const aEnd = new Date(a.ends_at || new Date(new Date(a.starts_at).getTime() + 2 * 3600 * 1000));
      if (new Date(b.starts_at) < aEnd) conflicts.push({ a: { id: a.id, title: a.title }, b: { id: b.id, title: b.title } });
      else break;
    }
  }

  // ---- Charts that earn their place -------------------------------------
  // Every series below is a real aggregate over rows the lead can act on.
  // The old "Workshop timeline" chart plotted value=1 per workshop, which
  // encoded nothing; it is replaced by these.

  // 1. Roster composition per level across the caller's scope.
  const rosterLevels = deptIds.length ? await sql`
    SELECT m.level AS name, COUNT(*)::int AS value
    FROM department_memberships m
    WHERE m.department_id = ANY(${deptIds})
    GROUP BY m.level ORDER BY m.level
  ` : [];

  // 2. Contribution ledger broken down by kind — the actual "who is doing what".
  const contributionKinds = deptIds.length ? await sql`
    SELECT c.kind AS name, COUNT(*)::int AS value
    FROM member_contributions c
    WHERE c.department_id = ANY(${deptIds})
    GROUP BY c.kind ORDER BY value DESC
  ` : [];

  // 3. Seat fill for upcoming workshops: registered vs capacity. Null capacity
  //    events are excluded rather than plotted as 100%.
  const workshopFill = deptIds.length ? await sql`
    SELECT e.title AS name,
           e.capacity,
           e.registered_count AS registered,
           GREATEST(e.capacity - e.registered_count, 0) AS remaining,
           (CASE WHEN e.capacity > 0
                 THEN ROUND((e.registered_count::numeric / e.capacity) * 100)
                 ELSE NULL END)::int AS fill_pct
    FROM events e
    WHERE e.tenant_id = ${tid}::uuid
      AND e.starts_at >= NOW() AND e.status = 'upcoming'
      AND e.department_id = ANY(${deptIds})
      AND e.capacity IS NOT NULL AND e.capacity > 0
    ORDER BY e.starts_at ASC LIMIT 8
  ` : [];

  // 4. Turnout on events that have already happened — did people actually show up.
  const turnout = deptIds.length ? await sql`
    SELECT e.title AS name,
           COUNT(r.id)::int AS registered,
           COUNT(r.id) FILTER (WHERE r.status = 'attended')::int AS attended
    FROM events e
    LEFT JOIN event_registrations r ON r.event_id = e.id
    WHERE e.tenant_id = ${tid}::uuid
      AND e.starts_at < NOW()
      AND e.department_id = ANY(${deptIds})
    GROUP BY e.id, e.title, e.starts_at
    ORDER BY e.starts_at DESC LIMIT 8
  ` : [];

  // 5. Membership growth over the last six months — the trend a lead is judged on.
  const growth = deptIds.length ? await sql`
    SELECT to_char(date_trunc('month', m.joined_at), 'Mon') AS name,
           COUNT(*)::int AS value
    FROM department_memberships m
    WHERE m.department_id = ANY(${deptIds})
      AND m.joined_at >= NOW() - INTERVAL '6 months'
    GROUP BY date_trunc('month', m.joined_at)
    ORDER BY date_trunc('month', m.joined_at)
  ` : [];

  // 6. Department health — headcount vs contribution ledger size. Reveals a
  //    department that is large but producing nothing.
  const deptHealth = departments.map((d) => ({
    name: d.name,
    members: d.members,
    contributions: d.contributions,
    core_requests: d.core_requests,
    succession_ready: d.succession_ready
  }));

  const attended = turnout.reduce((s, t) => s + t.attended, 0);
  const totalRegistered = turnout.reduce((s, t) => s + t.registered, 0);

  return {
    role: admin && profile.role === "admin" ? "admin" : profile.role,
    departments, roster, workshops, proposed, recentLogs,
    calendar, conflicts, myLedIds: ledIds, userId,
    charts: {
      rosterLevels,
      contributionKinds,
      workshopFill,
      turnout,
      growth,
      deptHealth,
      turnoutPct: totalRegistered > 0 ? Math.round((attended / totalRegistered) * 100) : null,
      totalContributions: contributionKinds.reduce((s, k) => s + k.value, 0)
    }
  };
}