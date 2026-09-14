import { createServerSupabase } from "@/lib/supabase/server";
import { getSql, queryTenant } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/AdminDashboard";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const sql = getSql();
  const tenant = await queryTenant("demo-college");
  const tid = tenant.id;

  const [students] = await sql`SELECT COUNT(*)::int AS c FROM profiles WHERE role = 'student' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)`;
  // Accessibility: who started, and are raw beginners still showing up?
  const [started] = await sql`
    SELECT COUNT(DISTINCT r.student_id)::int AS c FROM student_roadmap_progress r
    JOIN profiles p ON p.user_id = r.student_id
    WHERE r.status = 'completed' AND (p.tenant_id = ${tid} OR ${tid}::uuid IS NULL)
  `;
  const [beginnersActive] = await sql`
    SELECT COUNT(DISTINCT a.student_id)::int AS c FROM student_daily_activity a
    JOIN profiles p ON p.user_id = a.student_id
    LEFT JOIN student_roadmap_progress r ON r.student_id = a.student_id AND r.status = 'completed'
    WHERE (p.tenant_id = ${tid} OR ${tid}::uuid IS NULL) AND a.day >= CURRENT_DATE - 7
      AND (a.commits + a.pull_requests + a.reviews) > 0 AND r.student_id IS NULL
  `;
  // Readiness: documented, sustained work.
  const [completion] = await sql`
    SELECT COALESCE(AVG(roadmap_completion_pct),0)::numeric AS avg FROM student_analytics_snapshots
    WHERE tenant_id = ${tid} AND snapshot_date = CURRENT_DATE
  `;
  const [merges] = await sql`
    SELECT COUNT(*)::int AS c FROM student_oss_contributions
    WHERE status = 'verified' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)
  `;
  const [projects] = await sql`
    SELECT COUNT(*)::int AS c FROM projects pr
    JOIN profiles p ON p.user_id = pr.owner_id
    WHERE (p.tenant_id = ${tid} OR ${tid}::uuid IS NULL)
  `;
  // Excellence: external proof.
  const [submissions] = await sql`
    SELECT COUNT(*)::int AS c FROM contest_submissions s
    JOIN contests c ON c.id = s.contest_id
    WHERE c.tenant_id = ${tid} OR ${tid}::uuid IS NULL
  `;
  // Network: guides, gatherings, partnerships.
  const [mentors] = await sql`
    SELECT COUNT(*)::int AS c FROM mentors
    WHERE available = true AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)
  `;
  const [eventsHeld] = await sql`
    SELECT COUNT(*)::int AS c FROM events
    WHERE tenant_id = ${tid} AND starts_at < NOW() AND status <> 'cancelled'
  `;
  const [partnerships] = await sql`
    SELECT COUNT(*)::int AS c FROM chapter_partnerships
    WHERE (tenant_a_id = ${tid} OR tenant_b_id = ${tid}) AND status = 'active'
  `;
  // Attention queue — things waiting on a human.
  const [flagged] = await sql`
    SELECT COUNT(*)::int AS c FROM forum_flags
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `;
  const [claims] = await sql`
    SELECT COUNT(*)::int AS c FROM student_oss_contributions
    WHERE status = 'claimed' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)
  `;
  const [drafts] = await sql`
    SELECT COUNT(*)::int AS c FROM contests
    WHERE status = 'draft' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)
  `;
  const [applications] = await sql`
    SELECT COUNT(*)::int AS c FROM mentor_applications
    WHERE status = 'pending' AND (tenant_id = ${tid} OR ${tid}::uuid IS NULL)
  `;
  const upcoming = await sql`
    SELECT id, title, event_type, starts_at FROM events
    WHERE tenant_id = ${tid} AND starts_at >= NOW()
    ORDER BY starts_at ASC LIMIT 4
  `;
  const auditEntries = await sql`
    SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8
  `;

  const total = students?.c ?? 0;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <AdminDashboard
        outcomes={{
          accessibility: {
            startedPct: total > 0 ? Math.round(((started?.c ?? 0) / total) * 100) : 0,
            beginnersActive: beginnersActive?.c ?? 0
          },
          readiness: {
            completion: Math.round(Number(completion?.avg || 0)),
            merges: merges?.c ?? 0,
            projects: projects?.c ?? 0
          },
          excellence: {
            submissions: submissions?.c ?? 0,
            merges: merges?.c ?? 0
          },
          network: {
            mentors: mentors?.c ?? 0,
            eventsHeld: eventsHeld?.c ?? 0,
            partnerships: partnerships?.c ?? 0
          }
        }}
        attention={[
          { label: "Mentor applications awaiting review", count: applications?.c ?? 0, href: "/admin/mentors" },
          { label: "Content flags this week", count: flagged?.c ?? 0, href: "/admin/community" },
          { label: "OSS claims awaiting review", count: claims?.c ?? 0, href: "/admin/opensource" },
          { label: "Draft contests", count: drafts?.c ?? 0, href: "/admin/contests" }
        ]}
        upcoming={upcoming}
        auditEntries={auditEntries}
      />
    </AppShell>
  );
}
