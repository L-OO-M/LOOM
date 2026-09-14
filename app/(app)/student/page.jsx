import { createServerSupabase } from "@/lib/supabase/server";
import { getSql, queryTenant } from "@/lib/db";
import { eligibilityFor } from "@/lib/mentorship";
import { AppShell } from "@/components/AppShell";
import { StudentDashboard } from "@/components/StudentDashboard";

export default async function StudentPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const sql = getSql();
  const uid = user?.id ?? "";

  // Wave 1: tenant config (memoized in lib/db — ~free after first hit) and the
  // student profile, including first-visit auto-create. Independent → 1 wave.
  const [tenant, profile] = await Promise.all([
    queryTenant("demo-college"),
    (async () => {
      const [existing] = await sql`
        SELECT * FROM profiles WHERE user_id = ${uid} LIMIT 1
      `;
      if (existing || !user?.id) return existing || null;
      // Auto-create profile on first visit so new users aren't stuck with empty state
      const displayName = user.user_metadata?.name || user.email?.split("@")[0] || "Student";
      const [created] = await sql`
        INSERT INTO profiles (user_id, name, role, primary_domain)
        VALUES (${user.id}, ${displayName}, 'student', 'web')
        ON CONFLICT (user_id) DO NOTHING
        RETURNING *
      `;
      if (created) return created;
      const [refetched] = await sql`SELECT * FROM profiles WHERE user_id = ${user.id} LIMIT 1`;
      return refetched || null;
    })()
  ]);
  const tid = tenant?.id ?? null;
  const domain = profile?.primary_domain ?? "general";

  // Wave 2: every section below depends only on (uid, tid, domain), so all
  // queries fire concurrently instead of ~22 serial Singapore round-trips.
  // Query text is unchanged — only the awaiting moved into one Promise.all.
  const [
    nodes, done, weekRows, weekMilestoneRows, contests, events, sessions,
    recentNodes, recentOss, recentProjects, snapshotRows, mentorRows,
    eligibility, applicationRows, myProjectRows, mySolutionRows, openThreads,
    nextWorkshopRows, openContestRows, mentorCountRows, talkCountRows, ossCountRows
  ] = await Promise.all([
    sql`SELECT * FROM roadmap_nodes ORDER BY sort_order ASC`,
    sql`
      SELECT node_id FROM student_roadmap_progress
      WHERE student_id = ${uid} AND status = 'completed'
    `,
    // This week: Monday–Sunday strip from real daily activity.
    sql`
      SELECT day, commits, pull_requests, reviews FROM student_daily_activity
      WHERE student_id = ${uid} AND day >= CURRENT_DATE - INTERVAL '13 days'
      ORDER BY day ASC
    `,
    sql`
      SELECT COUNT(*)::int AS c FROM student_roadmap_progress
      WHERE student_id = ${uid} AND status = 'completed'
        AND completed_at >= CURRENT_DATE - INTERVAL '7 days'
    `,
    // Coming up: open contests, upcoming events, scheduled mentor sessions.
    sql`
      SELECT c.id, c.title, c.status, c.starts_at, c.ends_at,
        EXISTS(SELECT 1 FROM contest_registrations r WHERE r.contest_id = c.id AND r.student_id = ${uid}) AS registered
      FROM contests c
      WHERE c.status IN ('open', 'upcoming', 'published')
      ORDER BY c.starts_at ASC NULLS LAST LIMIT 3
    `,
    sql`
      SELECT e.id, e.title, e.event_type, e.starts_at, e.location, e.is_online,
        EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${uid}) AS registered
      FROM events e
      WHERE e.starts_at >= NOW() - INTERVAL '2 hours'
      ORDER BY e.starts_at ASC LIMIT 3
    `,
    sql`
      SELECT s.id, s.scheduled_at, s.status, m.expertise, p.name AS mentor_name
      FROM mentor_sessions s
      LEFT JOIN mentors m ON m.user_id = s.mentor_id
      LEFT JOIN profiles p ON p.user_id = s.mentor_id
      WHERE s.student_id = ${uid} AND s.scheduled_at >= NOW() - INTERVAL '2 hours'
      ORDER BY s.scheduled_at ASC LIMIT 2
    `,
    // Recent proof: completions, verified OSS, projects.
    sql`
      SELECT r.completed_at, n.title FROM student_roadmap_progress r
      JOIN roadmap_nodes n ON n.id = r.node_id
      WHERE r.student_id = ${uid} AND r.status = 'completed'
      ORDER BY r.completed_at DESC NULLS LAST LIMIT 3
    `,
    sql`
      SELECT pr_url, title, verified_at, status FROM student_oss_contributions
      WHERE student_id = ${uid}
      ORDER BY created_at DESC LIMIT 2
    `,
    sql`
      SELECT id, title, status, created_at FROM projects
      WHERE owner_id = ${uid}
      ORDER BY created_at DESC LIMIT 2
    `,
    // Growth story (insights folded in): latest snapshot.
    sql`
      SELECT * FROM student_analytics_snapshots WHERE student_id = ${uid}
      ORDER BY snapshot_date DESC LIMIT 1
    `,
    // The generational loop: mentor status, eligibility, latest application.
    sql`SELECT user_id FROM mentors WHERE user_id = ${uid} LIMIT 1`,
    user?.id ? eligibilityFor(sql, user.id).catch(() => null) : null,
    user?.id ? sql`
      SELECT status, created_at FROM mentor_applications WHERE student_id = ${user.id}
      ORDER BY created_at DESC LIMIT 1
    ` : [],
    sql`SELECT COUNT(*)::int AS c FROM projects WHERE owner_id = ${uid}`,
    sql`
      SELECT COUNT(*)::int AS c FROM forum_replies
      WHERE author_id = ${uid} AND is_answer = true AND status = 'visible'
    `,
    sql`
      SELECT t.id, t.title, t.reply_count FROM forum_threads t
      WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible'
        AND t.reply_count = 0 AND (t.domain = ${domain} OR t.domain = 'general')
      ORDER BY t.created_at DESC LIMIT 3
    `,
    // The weekly rhythm: six cadences, each with a live pulse.
    sql`
      SELECT title, starts_at FROM events
      WHERE tenant_id = ${tid}::uuid AND starts_at >= NOW() AND status <> 'cancelled'
      ORDER BY starts_at ASC LIMIT 1
    `,
    sql`
      SELECT COUNT(*)::int AS c FROM contests
      WHERE status IN ('open', 'published') AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    `,
    sql`
      SELECT COUNT(*)::int AS c FROM mentors
      WHERE available = true AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    `,
    sql`
      SELECT COUNT(*)::int AS c FROM events
      WHERE tenant_id = ${tid}::uuid AND event_type = 'talk'
        AND starts_at >= NOW() - INTERVAL '2 hours' AND status <> 'cancelled'
    `,
    sql`
      SELECT COUNT(*)::int AS c FROM open_source_projects
      WHERE is_curated = true AND (tenant_id IS NULL OR tenant_id = ${tid}::uuid)
    `
  ]);

  const [weekMilestones] = weekMilestoneRows;
  const [snapshot] = snapshotRows;
  const [mentorRow] = mentorRows;
  const [application] = applicationRows;
  const myProjects = myProjectRows;
  const [mySolutions] = mySolutionRows;
  const [nextWorkshop] = nextWorkshopRows;
  const [openContests] = openContestRows;
  const [mentorCount] = mentorCountRows;
  const [talkCount] = talkCountRows;
  const [ossCount] = ossCountRows;

  const doneIds = done.map((r) => r.node_id);
  const doneCount = doneIds.length;
  const totalCount = nodes.length;
  const overallPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const nextNode = nodes.find((n) => !doneIds.includes(n.id)) ?? null;
  const nextMilestone = nextNode?.title ?? null;

  const byDay = new Map(weekRows.map((r) => [String(r.day).slice(0, 10), r]));
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekDays = dayNames.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const r = byDay.get(iso);
    const hit = !!r && (r.commits || 0) + (r.pull_requests || 0) + (r.reviews || 0) > 0;
    return { label, hit, today: iso === new Date().toISOString().slice(0, 10) };
  });
  const weekHits = weekRows.filter((r) => (r.commits || 0) + (r.pull_requests || 0) + (r.reviews || 0) > 0);
  const weekSessions = new Set(weekHits.map((r) => String(r.day).slice(0, 10))).size;
  const weekContributions = weekHits.reduce((s, r) => s + (r.commits || 0) + (r.pull_requests || 0) + (r.reviews || 0), 0);

  const proof = [
    ...recentNodes.map((r) => ({
      text: `completed ${r.title}`,
      meta: r.completed_at ? new Date(r.completed_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) + " · roadmap" : "roadmap",
      href: "/student/roadmap",
      hot: true
    })),
    ...recentOss.map((o) => ({
      text: o.status === "merged" || o.verified_at ? `merged ${o.title || "a pull request"}` : `claimed ${o.title || "a pull request"}`,
      meta: "open source",
      href: o.pr_url || "/student/opensource",
      hot: !!(o.verified_at || o.status === "merged")
    })),
    ...recentProjects.map((p) => ({
      text: `published ${p.title}`,
      meta: "project",
      href: `/student/projects/${p.id}`,
      hot: false
    }))
  ].slice(0, 5);

  // Peer comparison needs the snapshot first — one conditional extra hop.
  let peers = null;
  if (snapshot) {
    [peers] = await sql`
      SELECT COALESCE(AVG(consistency_score),0)::numeric AS ac, COUNT(*)::int AS n
      FROM student_analytics_snapshots
      WHERE tenant_id = ${tid}::uuid AND snapshot_date = CURRENT_DATE AND student_id <> ${uid}
    `;
  }

  const isMentor = !!mentorRow;
  const stageIndex = isMentor ? 5
    : doneCount === 0 ? 0
    : (mySolutions?.c ?? 0) > 0 ? 4
    : (myProjects[0]?.c ?? 0) > 0 ? 3
    : doneCount >= 3 ? 2 : 1;

  const cadence = {
    workshop: nextWorkshop ? { title: nextWorkshop.title, when: nextWorkshop.starts_at } : null,
    contests: openContests?.c ?? 0,
    mentors: mentorCount?.c ?? 0,
    projects: myProjects[0]?.c ?? 0,
    talks: talkCount?.c ?? 0,
    oss: ossCount?.c ?? 0
  };
  const loop = {
    stageIndex, isMentor,
    eligible: eligibility?.eligible ?? false,
    reasons: eligibility?.reasons ?? [],
    stats: eligibility?.stats ?? null,
    applicationStatus: application?.status ?? null,
    openThreads
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" });

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <StudentDashboard
        profile={profile}
        greeting={greeting}
        todayLabel={todayLabel}
        nextNode={nextNode}
        nodes={nodes.map((n) => ({ id: n.id, title: n.title }))}
        doneIds={doneIds}
        overallPercent={overallPercent}
        nextMilestone={nextMilestone}
        weekDays={weekDays}
        weekCounts={{ sessions: weekSessions, contributions: weekContributions, milestones: weekMilestones?.c ?? 0 }}
        contests={contests}
        events={events}
        sessions={sessions}
        proof={proof}
        snapshot={snapshot}
        peers={peers}
        loop={loop}
        cadence={cadence}
      />
    </AppShell>
  );
}
