import { createServerSupabase } from "@/lib/supabase/server";
import { getSql } from "@/lib/db";
import { resolveRequestTenant } from "@/lib/tenant";
import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/app/(app)/admin/_components/AdminDashboard";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const sql = getSql();
  const tenant = await resolveRequestTenant();
  const tid = tenant.id;

  // One round-trip for every headline count: each metric is an independent
  // scalar subquery over the same chapter scope, so a single row carries the
  // whole dashboard header instead of ~15 sequential pooler checkouts.
  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM profiles
        WHERE role = 'student' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS students,
      (SELECT COUNT(DISTINCT r.student_id)::int FROM student_roadmap_progress r
        JOIN profiles p ON p.user_id = r.student_id
        WHERE r.status = 'completed' AND (p.tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS started,
      (SELECT COUNT(DISTINCT a.student_id)::int FROM student_daily_activity a
        JOIN profiles p ON p.user_id = a.student_id
        LEFT JOIN student_roadmap_progress r ON r.student_id = a.student_id AND r.status = 'completed'
        WHERE (p.tenant_id = ${tid} OR ${tid}::uuid IS NULL) AND a.day >= CURRENT_DATE - 7
          AND (a.commits + a.pull_requests + a.reviews) > 0 AND r.student_id IS NULL) AS beginners_active,
      (SELECT COALESCE(AVG(roadmap_completion_pct), 0)::numeric FROM student_analytics_snapshots
        WHERE tenant_id = ${tid} AND snapshot_date = CURRENT_DATE) AS completion_avg,
      (SELECT COUNT(*)::int FROM student_oss_contributions
        WHERE status = 'verified' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS merges,
      (SELECT COUNT(*)::int FROM student_oss_contributions
        WHERE status = 'claimed' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS claims,
      (SELECT COUNT(*)::int FROM projects pr
        JOIN profiles p ON p.user_id = pr.owner_id
        WHERE (p.tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS projects,
      (SELECT COUNT(*)::int FROM contest_submissions s
        JOIN contests c ON c.id = s.contest_id
        WHERE c.tenant_id = ${tid} OR ${tid}::uuid IS NULL) AS submissions,
      (SELECT COUNT(*)::int FROM contests
        WHERE status = 'draft' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS drafts,
      (SELECT COUNT(*)::int FROM mentors
        WHERE available = true AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS mentors,
      (SELECT COUNT(*)::int FROM events
        WHERE tenant_id = ${tid} AND starts_at < NOW() AND status <> 'cancelled') AS events_held,
      (SELECT COUNT(*)::int FROM chapter_partnerships
        WHERE (tenant_a_id = ${tid} OR tenant_b_id = ${tid}) AND status = 'active') AS partnerships,
      (SELECT COUNT(*)::int FROM mentor_applications
        WHERE status = 'pending' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS applications,
      (SELECT COUNT(*)::int FROM events
        WHERE status = 'proposed' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)) AS proposed_events,
      (SELECT COUNT(*)::int FROM forum_flags f
        WHERE f.created_at >= NOW() - INTERVAL '7 days'
          AND (
            (f.target_type = 'thread' AND EXISTS (
              SELECT 1 FROM forum_threads t WHERE t.id = f.target_id AND (t.tenant_id = ${tid} OR t.tenant_id IS NULL)
            ))
            OR (f.target_type = 'reply' AND EXISTS (
              SELECT 1 FROM forum_replies r JOIN forum_threads t ON t.id = r.thread_id
              WHERE r.id = f.target_id AND (t.tenant_id = ${tid} OR t.tenant_id IS NULL)
            ))
          )) AS flagged
  `;

  // Departments with membership aggregates as derived joins — one query no
  // matter how many departments, instead of four correlated subqueries
  // re-executed per department row.
  const departments = await sql`
    SELECT d.id, d.name, d.slug, d.vertical, d.is_active,
      hp.name AS head_name, cp.name AS co_head_name,
      COALESCE(m.members, 0)::int AS members,
      COALESCE(m.core_requests, 0)::int AS core_requests,
      COALESCE(m.successors, 0)::int AS successors,
      c.last_activity AS last_activity
    FROM departments d
    LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
    LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
    LEFT JOIN (
      SELECT department_id,
        COUNT(*)::int AS members,
        COUNT(*) FILTER (WHERE core_requested AND level = 'general')::int AS core_requests,
        COUNT(*) FILTER (WHERE succession_ready)::int AS successors
      FROM department_memberships
      GROUP BY department_id
    ) m ON m.department_id = d.id
    LEFT JOIN (
      SELECT department_id, MAX(created_at) AS last_activity
      FROM member_contributions
      GROUP BY department_id
    ) c ON c.department_id = d.id
    WHERE (d.tenant_id = ${tid} OR ${tid}::uuid IS NULL)
    ORDER BY d.vertical, d.name
  `;
  const coreRequests = departments.reduce((s, d) => s + (d.core_requests || 0), 0);
  const upcoming = await sql`
    SELECT id, title, event_type, starts_at FROM events
    WHERE tenant_id = ${tid} AND starts_at >= NOW()
    ORDER BY starts_at ASC LIMIT 4
  `;
  // writeAudit stores the chapter in metadata JSONB (audit_logs has no
  // tenant_id column) — filter on it so one chapter never sees another's
  // feed. Actor names are joined so the trail reads as people, not UUIDs.
  // before/after JSONB is deliberately not selected for a preview feed.
  const auditEntries = await sql`
    SELECT a.id, a.actor_id, a.action, a.resource, a.resource_id, a.created_at,
      p.name AS actor_name
    FROM audit_logs a
    LEFT JOIN profiles p ON p.user_id = a.actor_id
    WHERE (a.metadata->>'tenant_id') = ${tid}::text
    ORDER BY a.created_at DESC LIMIT 8
  `;

  // Chart data — sequential, tenant-scoped, single-pass aggregates (pooler-safe).
  const roleDistRaw = await sql`
    SELECT role, COUNT(*)::int AS c FROM profiles
    WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    GROUP BY role ORDER BY c DESC
  `;
  const projectStatusRaw = await sql`
    SELECT COALESCE(pr.status, 'unknown') AS status, COUNT(*)::int AS c
    FROM projects pr JOIN profiles p ON p.user_id = pr.owner_id
    WHERE (p.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    GROUP BY pr.status ORDER BY c DESC
  `;
  const dailyRaw = await sql`
    SELECT a.day::text AS day, SUM(a.commits + a.pull_requests + a.reviews)::int AS total
    FROM student_daily_activity a JOIN profiles p ON p.user_id = a.student_id
    WHERE (p.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AND a.day >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY a.day ORDER BY a.day ASC
  `;

  const total = counts?.students ?? 0;
  const roleDist = roleDistRaw.map((r) => ({ name: r.role, value: r.c }));
  const projectStatus = projectStatusRaw.map((r) => ({ name: r.status, value: r.c }));
  const dailyActivity = dailyRaw.map((r) => ({ label: new Date(r.day).toLocaleDateString("en-IN", { month: "short", day: "numeric" }), value: r.total, day: r.day }));

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <AdminDashboard
        tenantName={tenant?.name ?? null}
        totalStudents={total}
        outcomes={{
          accessibility: {
            startedPct: total > 0 ? Math.round(((counts?.started ?? 0) / total) * 100) : 0,
            beginnersActive: counts?.beginners_active ?? 0
          },
          readiness: {
            completion: Math.round(Number(counts?.completion_avg || 0)),
            projects: counts?.projects ?? 0
          },
          excellence: {
            submissions: counts?.submissions ?? 0,
            merges: counts?.merges ?? 0
          },
          network: {
            mentors: counts?.mentors ?? 0,
            eventsHeld: counts?.events_held ?? 0,
            partnerships: counts?.partnerships ?? 0
          }
        }}
        attention={[
          { label: "Mentor applications awaiting review", count: counts?.applications ?? 0, href: "/admin/mentors" },
          { label: "Core requests awaiting a Head", count: coreRequests, href: "/lead" },
          { label: "Proposed society events", count: counts?.proposed_events ?? 0, href: "/lead" },
          { label: "Content flags this week", count: counts?.flagged ?? 0, href: "/admin/community" },
          { label: "OSS claims awaiting review", count: counts?.claims ?? 0, href: "/admin/opensource" },
          { label: "Draft contests", count: counts?.drafts ?? 0, href: "/admin/contests" }
        ]}
        departments={departments}
        upcoming={upcoming}
        auditEntries={auditEntries}
        charts={{ roleDist, projectStatus, dailyActivity }}
      />
    </AppShell>
  );
}
