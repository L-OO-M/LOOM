import { loadMyWork } from "./my-work";
import { termExpired } from "./permissions";
import { normalizeDomainKey } from "./domains";

/**
 * Reads one member's real numbers for the insight engine.
 *
 * This is the only new query surface insights add. Everything it returns is a
 * count or a date the member can already see on another page — the engine does
 * not invent a score, and this module does not cache a second truth. Work is
 * read through `loadMyWork` so "3 overdue" on the insight card and the overdue
 * filter on /student/work can never disagree.
 *
 * Queries are sequential, not batched: the pool is capped at ten connections
 * and AGENTS.md forbids Promise.all on a page load.
 */
export async function loadStudentInsightMetrics(sql, { userId, tenantId, profile = {}, now = Date.now() } = {}) {
  const work = await loadMyWork(sql, { tenantId, userId, now });

  // The same scoping the roadmap page uses: one track, verified ticks only
  // (lib/roadmap.js#domainProgress). A percentage built from claims against the
  // whole catalogue would disagree with /student/roadmap on the same day, and
  // two answers to "how far am I" is exactly the trust defect lib/roadmap.js
  // was written to end.
  const domain = normalizeDomainKey(profile?.primary_domain);

  // Roadmap, the latest nightly snapshot, the peer average, and the 14-day
  // strip in one round trip. `student_analytics_snapshots` is a rollup, so a
  // member with no snapshot yet legitimately gets null rather than a zero.
  const [growth] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM roadmap_nodes WHERE domain = ${domain}) AS nodes_total,
      (SELECT json_build_object(
         'done', COUNT(*)::int,
         'verified', COUNT(*) FILTER (WHERE p.evidence_state = 'verified')::int
       )
       FROM student_roadmap_progress p
       JOIN roadmap_nodes n ON n.id = p.node_id AND n.domain = ${domain}
       WHERE p.student_id = ${userId} AND p.status = 'completed') AS roadmap,
      (SELECT to_jsonb(s) FROM student_analytics_snapshots s
       WHERE s.student_id = ${userId}
       ORDER BY s.snapshot_date DESC LIMIT 1) AS snapshot,
      (SELECT json_build_object(
         'consistency', COALESCE(AVG(consistency_score), 0)::numeric,
         'n', COUNT(*)::int
       ) FROM student_analytics_snapshots
       WHERE tenant_id = ${tenantId}::uuid
         AND student_id <> ${userId}
         AND snapshot_date = (
           SELECT MAX(snapshot_date) FROM student_analytics_snapshots
           WHERE tenant_id = ${tenantId}::uuid
         )) AS peers,
      (SELECT to_char(MAX(day), 'YYYY-MM-DD') FROM student_daily_activity
       WHERE student_id = ${userId}) AS last_active,
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
         SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS day,
                consistency_score, roadmap_completion_pct, total_commits
         FROM student_analytics_snapshots
         WHERE student_id = ${userId}
         ORDER BY snapshot_date DESC LIMIT 14
       ) j) AS trend
  `;

  // Attendance, public proof, mentoring, and the open practice week. Each is a
  // different table and a different vocabulary; grouping them here keeps the
  // page at two reads instead of six.
  const [signals] = await sql`
    SELECT
      (SELECT json_build_object(
         'registered', COUNT(*)::int,
         'attended', COUNT(*) FILTER (WHERE r.attended_at IS NOT NULL)::int
       )
       FROM event_registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.student_id = ${userId}
         AND e.tenant_id = ${tenantId}::uuid
         AND r.status <> 'cancelled') AS events,
      (SELECT COUNT(*)::int FROM student_oss_contributions
       WHERE student_id = ${userId}
         AND tenant_id = ${tenantId}::uuid
         AND status = 'verified') AS oss,
      (SELECT json_build_object(
         'sessions', (SELECT COUNT(*)::int FROM mentor_sessions
                      WHERE mentor_id = ${userId} AND status = 'completed'),
         'mentees', (SELECT COUNT(DISTINCT student_id)::int FROM mentor_sessions
                     WHERE mentor_id = ${userId})
       )) AS mentoring,
      (SELECT json_build_object(
         'total', (SELECT COUNT(*)::int FROM practice_questions q
                   WHERE q.week_id = w.id AND q.tenant_id = w.tenant_id),
         'solved', (SELECT COUNT(DISTINCT s.question_id)::int
                    FROM practice_solves s
                    JOIN practice_questions q2 ON q2.id = s.question_id
                    WHERE s.user_id = ${userId}
                      AND s.tenant_id = w.tenant_id
                      AND q2.week_id = w.id)
       )
       FROM practice_weeks w
       WHERE w.tenant_id = ${tenantId}::uuid
         AND w.status = 'scheduled'
         AND w.end_at >= NOW()
       ORDER BY w.start_at ASC LIMIT 1) AS practice
  `;

  const memberships = Array.isArray(profile.memberships) ? profile.memberships : [];
  const coreSeats = memberships.filter((membership) => membership.level === "core");
  const ledDepartments = memberships.filter(
    (membership) => membership.level === "dept_lead" && !termExpired(membership.term_end)
  ).length;

  // A Core member's review queue is work other people are waiting on. Only
  // queried when a Core seat exists, so the common page load stays at three
  // reads.
  let reviewQueue = 0;
  if (coreSeats.length > 0) {
    const deptIds = coreSeats.map((membership) => membership.department_id).filter(Boolean);
    if (deptIds.length > 0) {
      const [row] = await sql`
        SELECT COUNT(*)::int AS pending
        FROM department_tasks
        WHERE tenant_id = ${tenantId}::uuid
          AND is_active
          AND status = 'submitted'
          AND department_id = ANY(${deptIds})
          AND submitted_by IS DISTINCT FROM ${userId}
          AND assignee_id IS DISTINCT FROM ${userId}
      `;
      reviewQueue = Number(row?.pending) || 0;
    }
  }

  const snapshot = growth?.snapshot || null;
  const nodesDone = Number(growth?.roadmap?.done) || 0;
  const verifiedNodes = Number(growth?.roadmap?.verified) || 0;
  const nodesTotal = Number(growth?.nodes_total) || 0;
  const peers = growth?.peers || null;
  const events = signals?.events || null;
  const mentoring = signals?.mentoring || null;
  const practice = signals?.practice || null;
  const lastActive = growth?.last_active || null;
  const activeDay = lastActive ? Date.parse(`${lastActive}T00:00:00Z`) : NaN;

  return {
    // Engine inputs.
    roadmapPct: nodesTotal > 0 ? Math.round((verifiedNodes / nodesTotal) * 100) : 0,
    nodesTotal,
    provisionalNodes: Math.max(0, nodesDone - verifiedNodes),
    consistency: snapshot ? Number(snapshot.consistency_score) || 0 : null,
    peerConsistency: Number(peers?.consistency) || 0,
    peerCount: Number(peers?.n) || 0,
    ossVerified: Number(signals?.oss) || 0,
    daysSinceActive: Number.isFinite(activeDay) ? Math.max(0, Math.floor((now - activeDay) / 86400000)) : null,
    overdueWork: work.summary.departmentOverdue + work.summary.eventOverdue,
    openWork: work.summary.totalOpen,
    blockedWork: work.department.filter((task) => task.status === "blocked").length,
    submittedWork: work.summary.departmentAwaitingReview,
    eventsRegistered: Number(events?.registered) || 0,
    eventsAttended: Number(events?.attended) || 0,
    practiceTotal: Number(practice?.total) || 0,
    practiceSolved: Number(practice?.solved) || 0,
    mentees: Number(mentoring?.mentees) || 0,
    mentorSessions: Number(mentoring?.sessions) || 0,
    coreSeats: coreSeats.map((membership) => membership.name || membership.slug || "your department"),
    reviewQueue,
    ledDepartments,

    // Page extras (ignored by the engine): the evidence behind the cards.
    snapshot,
    trend: Array.isArray(growth?.trend) ? [...growth.trend].reverse() : [],
    lastActive,
    nodesDone,
    verifiedNodes
  };
}
