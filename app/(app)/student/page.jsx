import { createServerSupabase } from "@/lib/supabase/server";
import { getSql, queryTenant } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { StudentDashboard } from "@/components/StudentDashboard";

export default async function StudentPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const sql = getSql();
  const tenant = await queryTenant("demo-college");

  let [profile] = await sql`
    SELECT * FROM profiles WHERE user_id = ${user?.id ?? ""} LIMIT 1
  `;

  // Auto-create profile on first visit so new users aren't stuck with empty state
  if (!profile && user?.id) {
    const displayName = user.user_metadata?.name || user.email?.split("@")[0] || "Student";
    const [created] = await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain)
      VALUES (${user.id}, ${displayName}, 'student', 'web')
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    if (created) profile = created;
    else {
      const [refetched] = await sql`SELECT * FROM profiles WHERE user_id = ${user.id} LIMIT 1`;
      profile = refetched;
    }
  }

  const nodes = await sql`
    SELECT * FROM roadmap_nodes ORDER BY sort_order ASC
  `;

  const done = await sql`
    SELECT node_id FROM student_roadmap_progress
    WHERE student_id = ${user?.id ?? ""} AND status = 'completed'
  `;
  const doneIds = done.map(r => r.node_id);
  const doneCount = doneIds.length;
  const totalCount = nodes.length;
  const overallPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const activity = await sql`
    SELECT * FROM student_daily_activity
    WHERE student_id = ${user?.id ?? ""}
    ORDER BY day DESC LIMIT 1
  `;

  const resources = await sql`
    SELECT * FROM resources ORDER BY minutes ASC LIMIT 6
  `;

  // Chapter-average completion per domain for the skill radar.
  const [{ students = 0 } = {}] = await sql`SELECT COUNT(*)::int AS students FROM profiles WHERE tenant_id = ${tenant.id} AND role = 'student'`;
  const nodesByDomain = await sql`SELECT domain, COUNT(*)::int AS n FROM roadmap_nodes GROUP BY domain`;
  const completions = await sql`
    SELECT n.domain, COUNT(*)::int AS completions FROM student_roadmap_progress r
    JOIN roadmap_nodes n ON n.id = r.node_id
    JOIN profiles p ON p.user_id = r.student_id
    WHERE p.tenant_id = ${tenant.id} AND r.status = 'completed'
    GROUP BY n.domain
  `;
  const domainAvg = {};
  for (const d of nodesByDomain) {
    const c = completions.find((x) => x.domain === d.domain)?.completions || 0;
    domainAvg[d.domain] = students > 0 && d.n > 0 ? Math.round((c / (students * d.n)) * 1000) / 10 : 0;
  }

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <StudentDashboard
        profile={profile}
        nodes={nodes}
        doneIds={doneIds}
        doneCount={doneCount}
        totalCount={totalCount}
        overallPercent={overallPercent}
        activity={activity}
        resources={resources}
        domainAvg={domainAvg}
      />
    </AppShell>
  );
}