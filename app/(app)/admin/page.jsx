import { createServerSupabase } from "@/lib/supabase/server";
import { getSql, queryTenant } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/AdminDashboard";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const sql = getSql();
  const tenant = await queryTenant("demo-college");

  const [students] = await sql`SELECT COUNT(*)::int AS c FROM profiles WHERE role = 'student' AND (tenant_id = ${tenant.id} OR ${tenant.id}::uuid IS NULL)`;
  const [active7d] = await sql`
    SELECT COUNT(DISTINCT student_id)::int AS c FROM student_daily_activity
    WHERE day >= CURRENT_DATE - INTERVAL '7 days'
      AND (commits + pull_requests + reviews) > 0
  `;
  const [events24h] = await sql`
    SELECT COUNT(*)::int AS c FROM github_events WHERE received_at > NOW() - INTERVAL '1 day'
  `;
  const [completion] = await sql`
    SELECT COALESCE(AVG(roadmap_completion_pct),0)::numeric AS avg FROM student_analytics_snapshots
    WHERE tenant_id = ${tenant.id} AND snapshot_date = CURRENT_DATE
  `;
  const [cohort] = await sql`
    SELECT * FROM cohort_metrics WHERE tenant_id = ${tenant.id}
    ORDER BY cohort_date DESC LIMIT 1
  `;
  // Attention queue — things waiting on a human.
  const [flagged] = await sql`
    SELECT COUNT(*)::int AS c FROM forum_flags
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `;
  const [claims] = await sql`
    SELECT COUNT(*)::int AS c FROM student_oss_contributions
    WHERE status = 'claimed' AND (tenant_id = ${tenant.id} OR ${tenant.id}::uuid IS NULL)
  `;
  const [drafts] = await sql`
    SELECT COUNT(*)::int AS c FROM contests
    WHERE status = 'draft' AND (tenant_id = ${tenant.id} OR ${tenant.id}::uuid IS NULL)
  `;
  const upcoming = await sql`
    SELECT id, title, event_type, starts_at FROM events
    WHERE tenant_id = ${tenant.id} AND starts_at >= NOW()
    ORDER BY starts_at ASC LIMIT 4
  `;
  const auditEntries = await sql`
    SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <AdminDashboard
        health={{
          students: students?.c ?? 0,
          active7d: active7d?.c ?? 0,
          events24h: events24h?.c ?? 0,
          completion: Number(completion?.avg || cohort?.avg_roadmap_pct || 0)
        }}
        attention={[
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
