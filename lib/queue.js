import { hasVerticalLeadGrant, isAdmin, termExpired } from "@/lib/permissions";
import { scope } from "@/lib/tenant-scope";

/**
 * The operational queue: what is waiting on a human, and for how long.
 *
 * This module owns no workflow. Every count is a read over a table another
 * module already writes, and every href points at the screen that already has
 * the buttons. It exists because the decisions were spread across ten surfaces
 * and nothing answered "what needs me today" -- so work sat where nobody looked.
 *
 * Three groups, deliberately not one list:
 *
 *   action     -- the viewer is the person who must decide. A number here is a
 *                 debt the viewer personally owes.
 *   attention  -- something is deteriorating (blocked, overdue, unowned) or
 *                 someone is waiting on a decision the viewer cannot make.
 *   visibility -- not a problem yet. Due soon, so it can be planned for.
 *
 * Mixing them is how an operations dashboard becomes noise: a blocked task the
 * viewer cannot unblock is not the same obligation as a submission waiting for
 * their approval, and neither is a task due next Thursday.
 *
 * Scope is resolved once, from the viewer's own profile, and applied to every
 * query -- a department head's queue cannot widen by asking for a different
 * page. This module is read-only: it never writes, and it never reassigns.
 */

export const QUEUE_GROUPS = Object.freeze({
  ACTION: "action",
  ATTENTION: "attention",
  VISIBILITY: "visibility"
});

const DAY_MS = 86400000;

/** Whole days since an ISO timestamp, or null. Server-side so hydration cannot disagree. */
function daysSince(oldest) {
  if (!oldest) return null;
  const then = new Date(oldest);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / DAY_MS));
}

/**
 * Which departments this viewer's queue covers.
 * admin -> every active department; vertical lead -> their vertical;
 * department head -> the departments they actually lead.
 */
async function resolveScope(sql, { tenantId, profile }) {
  if (isAdmin(profile)) {
    const departments = await sql`
      SELECT id, slug FROM departments
      WHERE tenant_id = ${scope(tenantId)}::uuid AND is_active
      ORDER BY name
    `;
    return { admin: true, vertical: false, departments };
  }

  if (profile?.role === "vertical_lead") {
    const granted = hasVerticalLeadGrant(
      { id: profile.id, tenantId, scopedGrants: profile.scopedGrants || [] },
      profile.vertical
    );
    if (granted) {
      const departments = await sql`
        SELECT id, slug FROM departments
        WHERE tenant_id = ${scope(tenantId)}::uuid AND is_active AND vertical = ${profile.vertical}
        ORDER BY name
      `;
      return { admin: false, vertical: true, departments };
    }
  }

  const ledIds = (profile?.memberships || [])
    .filter((m) => m.level === "dept_lead" && !termExpired(m.term_end))
    .map((m) => m.department_id);

  if (ledIds.length === 0) return { admin: false, vertical: false, departments: [] };

  const departments = await sql`
    SELECT id, slug FROM departments
    WHERE tenant_id = ${scope(tenantId)}::uuid AND id = ANY(${ledIds})
    ORDER BY name
  `;
  return { admin: false, vertical: false, departments };
}

/** One department -> its page. Several -> the department index. Never a dead end. */
function departmentHref(departments) {
  return departments.length === 1 ? `/lead/departments/${departments[0].slug}` : "/lead/departments";
}

/**
 * What each counter means, where it lives, and who owes it.
 *
 * Exported so the grouping policy can be tested without a database: the rule
 * that a department head sees seat requests as attention (they cannot decide
 * one) rather than as their own action is a policy, not a query detail.
 */
export function buildDefinitions({ admin = false, vertical = false } = {}, deptLink = "/lead/departments") {
  return [
    { key: "task_reviews", label: "Submissions waiting for your review", href: deptLink, group: QUEUE_GROUPS.ACTION },
    {
      key: "seat_requests",
      label: "Seat requests awaiting a decision",
      href: admin ? "/admin/requests" : "/lead/roster",
      // A head cannot decide a seat; calling it their action would be a lie.
      group: admin || vertical ? QUEUE_GROUPS.ACTION : QUEUE_GROUPS.ATTENTION
    },
    { key: "proof_reviews", label: "Proof awaiting verification", href: "/admin/ranking", group: QUEUE_GROUPS.ACTION },
    { key: "proposed_events", label: "Event proposals awaiting review", href: "/admin/events", group: QUEUE_GROUPS.ACTION },
    { key: "mentor_applications", label: "Mentor applications awaiting review", href: "/admin/mentors", group: QUEUE_GROUPS.ACTION },
    { key: "oss_claims", label: "OSS claims awaiting review", href: "/admin/opensource", group: QUEUE_GROUPS.ACTION },
    { key: "contest_judging", label: "Contest submissions awaiting judging", href: "/admin/contests", group: QUEUE_GROUPS.ACTION },
    { key: "content_flags", label: "Content flags this week", href: "/admin/community", group: QUEUE_GROUPS.ACTION },
    { key: "overdue_work", label: "Department work past its due date", href: deptLink, group: QUEUE_GROUPS.ATTENTION },
    { key: "blocked_work", label: "Department work reported blocked", href: deptLink, group: QUEUE_GROUPS.ATTENTION },
    { key: "unassigned_work", label: "Department work with no owner", href: deptLink, group: QUEUE_GROUPS.ATTENTION },
    { key: "due_soon_work", label: "Department work due in the next 3 days", href: deptLink, group: QUEUE_GROUPS.VISIBILITY }
  ];
}

/**
 * @returns {Promise<{items: Array<object>, total: number, actionTotal: number, attentionTotal: number, visibilityTotal: number}>}
 */
export async function loadQueue(sql, { tenantId, profile }) {
  const viewer = await resolveScope(sql, { tenantId, profile });
  const deptIds = viewer.departments.map((d) => d.id);
  const deptLink = departmentHref(viewer.departments);
  const tid = scope(tenantId);
  const parts = [];

  if (deptIds.length > 0) {
    // Work the head must review. submitted_at is the clock: how long the member
    // has been waiting for an answer, not how long the task existed.
    parts.push(sql`
      SELECT 'task_reviews' AS key, COUNT(*)::int AS count, MIN(t.submitted_at) AS oldest
        FROM department_tasks t
       WHERE t.tenant_id = ${tid}::uuid AND t.is_active
         AND t.department_id = ANY(${deptIds}) AND t.status = 'submitted'
    `);
    parts.push(sql`
      SELECT 'blocked_work' AS key, COUNT(*)::int AS count, MIN(t.updated_at) AS oldest
        FROM department_tasks t
       WHERE t.tenant_id = ${tid}::uuid AND t.is_active
         AND t.department_id = ANY(${deptIds}) AND t.status = 'blocked'
    `);
    parts.push(sql`
      SELECT 'overdue_work' AS key, COUNT(*)::int AS count, MIN(t.due_at) AS oldest
        FROM department_tasks t
       WHERE t.tenant_id = ${tid}::uuid AND t.is_active
         AND t.department_id = ANY(${deptIds})
         AND t.status IN ('assigned', 'in_progress', 'blocked')
         AND t.due_at IS NOT NULL AND t.due_at < NOW()
    `);
    parts.push(sql`
      SELECT 'due_soon_work' AS key, COUNT(*)::int AS count, MIN(t.due_at) AS oldest
        FROM department_tasks t
       WHERE t.tenant_id = ${tid}::uuid AND t.is_active
         AND t.department_id = ANY(${deptIds})
         AND t.status IN ('assigned', 'in_progress', 'blocked')
         AND t.due_at >= NOW() AND t.due_at < NOW() + INTERVAL '3 days'
    `);
    // Work nobody owns. A task with no assignee is not a member's problem, so it
    // would never appear in anyone's My Work -- it can sit forever otherwise.
    parts.push(sql`
      SELECT 'unassigned_work' AS key, COUNT(*)::int AS count, MIN(t.created_at) AS oldest
        FROM department_tasks t
       WHERE t.tenant_id = ${tid}::uuid AND t.is_active
         AND t.department_id = ANY(${deptIds})
         AND t.assignee_id IS NULL
         AND t.status IN ('assigned', 'in_progress', 'blocked')
    `);
    parts.push(sql`
      SELECT 'seat_requests' AS key, COUNT(*)::int AS count, MIN(r.created_at) AS oldest
        FROM role_requests r
       WHERE r.tenant_id = ${tid}::uuid AND r.status = 'open'
         AND r.department_id = ANY(${deptIds})
    `);
  }

  if (viewer.admin || viewer.vertical) {
    parts.push(sql`
      SELECT 'proposed_events' AS key, COUNT(*)::int AS count, MIN(e.created_at) AS oldest
        FROM events e
       WHERE e.tenant_id = ${tid}::uuid
         AND e.status IN ('submitted', 'under_review', 'proposed')
    `);
  }

  if (viewer.admin) {
    // The proof queue is the one that unblocks seats: a Core request needs three
    // verified pieces, and nothing is verified until this is emptied.
    parts.push(sql`
      SELECT 'proof_reviews' AS key, COUNT(*)::int AS count, MIN(x.updated_at) AS oldest
        FROM (
          SELECT updated_at FROM student_roadmap_progress
           WHERE tenant_id = ${tid}::uuid AND status = 'completed' AND evidence_state = 'provisional'
          UNION ALL
          SELECT updated_at FROM projects
           WHERE tenant_id = ${tid}::uuid AND evidence_state = 'provisional'
        ) x
    `);
    parts.push(sql`
      SELECT 'mentor_applications' AS key, COUNT(*)::int AS count, MIN(m.created_at) AS oldest
        FROM mentor_applications m
       WHERE m.tenant_id = ${tid}::uuid AND m.status = 'pending'
    `);
    parts.push(sql`
      SELECT 'oss_claims' AS key, COUNT(*)::int AS count, MIN(o.created_at) AS oldest
        FROM student_oss_contributions o
       WHERE o.tenant_id = ${tid}::uuid AND o.status = 'claimed'
    `);
    parts.push(sql`
      SELECT 'contest_judging' AS key, COUNT(*)::int AS count, MIN(s.created_at) AS oldest
        FROM contest_submissions s
       WHERE s.tenant_id = ${tid}::uuid AND s.status = 'submitted'
    `);
    // Same tenant predicate the admin dashboard already used, so the two can
    // never disagree on what counts as a flag.
    parts.push(sql`
      SELECT 'content_flags' AS key, COUNT(*)::int AS count, MIN(f.created_at) AS oldest
        FROM forum_flags f
       WHERE f.created_at >= NOW() - INTERVAL '7 days'
         AND (
           (f.target_type = 'thread' AND EXISTS (
             SELECT 1 FROM forum_threads t WHERE t.id = f.target_id AND t.tenant_id = ${tid}::uuid
           ))
           OR (f.target_type = 'reply' AND EXISTS (
             SELECT 1 FROM forum_replies r JOIN forum_threads t ON t.id = r.thread_id
              WHERE r.id = f.target_id AND t.tenant_id = ${tid}::uuid
           ))
         )
    `);
  }

  if (parts.length === 0) {
    return { items: [], total: 0, actionTotal: 0, attentionTotal: 0, visibilityTotal: 0 };
  }

  // One round-trip for every counter. postgres.js flattens nested fragments, so
  // the reduce builds a single UNION ALL instead of N queries.
  const union = parts.reduce((acc, part) => (acc ? sql`${acc} UNION ALL ${part}` : part), null);
  const rows = await sql`${union}`;
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const definitions = buildDefinitions(viewer, deptLink);

  const items = definitions
    .map((definition) => {
      const row = byKey.get(definition.key);
      const count = Number(row?.count) || 0;
      return { ...definition, count, waitingDays: count > 0 ? daysSince(row?.oldest) : null };
    })
    .filter((item) => item.count > 0);

  // Oldest first, then the largest pile. A 12-day-old decision outranks a fresh
  // pile of six, because the first is the one that has been forgotten.
  items.sort((a, b) => (b.waitingDays ?? -1) - (a.waitingDays ?? -1) || b.count - a.count);

  const sum = (group) =>
    items.filter((i) => i.group === group).reduce((total, i) => total + i.count, 0);

  const actionTotal = sum(QUEUE_GROUPS.ACTION);
  const attentionTotal = sum(QUEUE_GROUPS.ATTENTION);
  const visibilityTotal = sum(QUEUE_GROUPS.VISIBILITY);

  return {
    items,
    total: actionTotal + attentionTotal + visibilityTotal,
    actionTotal,
    attentionTotal,
    visibilityTotal
  };
}
