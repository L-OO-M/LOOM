import { createServerSupabase } from "@/lib/supabase/server";
import { getSql } from "@/lib/db";
import { resolveRequestTenant } from "@/lib/tenant";
import { eligibilityFor } from "@/lib/mentorship";
import { AppShell } from "@/components/AppShell";
import { StudentDashboard } from "@/app/(app)/student/_components/StudentDashboard";

export default async function StudentPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const sql = getSql();
  // Chapter resolved from the request host (multi-chapter safe); demo slug
  // is only a fallback when host headers are absent (local dev, tests).
  const tenant = await resolveRequestTenant();

  let [profile] = await sql`
    SELECT * FROM profiles WHERE user_id = ${user?.id ?? ""} LIMIT 1
  `;

  // Auto-create profile on first visit so new users aren't stuck with empty state.
  // Consumes the same signup metadata as lib/auth-server (roll, branch, year,
  // instant domain memberships) — whichever entry point runs first wins.
  if (!profile && user?.id) {
    const meta = user.user_metadata || {};
    const displayName = meta.name || user.email?.split("@")[0] || "Student";
    const year = Number.isInteger(meta.year) && meta.year >= 1 && meta.year <= 6 ? meta.year : null;
    const [created] = await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain, tenant_id, roll_number, branch, year)
      VALUES (${user.id}, ${displayName}, 'student', 'web', ${tenant?.id ?? null}, ${meta.roll_number || null}, ${meta.branch || null}, ${year})
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    if (created) {
      profile = created;
      try {
        const picked = Array.isArray(meta.domains) ? meta.domains.filter((d) => typeof d === "string") : [];
        if (picked.length && tenant?.id) {
          const depts = await sql`SELECT id FROM departments WHERE tenant_id = ${tenant.id} AND is_active AND slug = ANY(${picked})`;
          for (const d of depts) {
            await sql`INSERT INTO department_memberships (user_id, department_id, level) VALUES (${user.id}, ${d.id}, 'general') ON CONFLICT (user_id, department_id) DO NOTHING`;
          }
        }
      } catch { /* membership seeding must never break first login */ }
    } else {
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
  const doneIds = done.map((r) => r.node_id);
  const doneCount = doneIds.length;
  const totalCount = nodes.length;
  const overallPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const nextNode = nodes.find((n) => !doneIds.includes(n.id)) ?? null;
  const nextMilestone = nextNode?.title ?? null;

  // This week: Monday–Sunday strip from real daily activity.
  const weekRows = await sql`
    SELECT day, commits, pull_requests, reviews FROM student_daily_activity
    WHERE student_id = ${user?.id ?? ""} AND day >= CURRENT_DATE - INTERVAL '13 days'
    ORDER BY day ASC
  `;
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
  const [weekMilestones] = await sql`
    SELECT COUNT(*)::int AS c FROM student_roadmap_progress
    WHERE student_id = ${user?.id ?? ""} AND status = 'completed'
      AND completed_at >= CURRENT_DATE - INTERVAL '7 days'
  `;

  // Coming up: open contests, upcoming events, scheduled mentor sessions.
  const contests = await sql`
    SELECT c.id, c.title, c.status, c.starts_at, c.ends_at,
      EXISTS(SELECT 1 FROM contest_registrations r WHERE r.contest_id = c.id AND r.student_id = ${user?.id ?? ""}) AS registered
    FROM contests c
    WHERE c.status IN ('open', 'upcoming', 'published')
    ORDER BY c.starts_at ASC NULLS LAST LIMIT 3
  `;
  const events = await sql`
    SELECT e.id, e.title, e.event_type, e.starts_at, e.location, e.is_online,
      EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user?.id ?? ""}) AS registered
    FROM events e
    WHERE e.tenant_id = ${tenant?.id ?? null}::uuid AND e.status IN ('upcoming', 'live')
      AND e.starts_at >= NOW() - INTERVAL '2 hours'
    ORDER BY e.starts_at ASC LIMIT 3
  `;
  const sessions = await sql`
    SELECT s.id, s.scheduled_at, s.status, m.expertise, p.name AS mentor_name
    FROM mentor_sessions s
    LEFT JOIN mentors m ON m.user_id = s.mentor_id
    LEFT JOIN profiles p ON p.user_id = s.mentor_id
    WHERE s.student_id = ${user?.id ?? ""} AND s.scheduled_at >= NOW() - INTERVAL '2 hours'
    ORDER BY s.scheduled_at ASC LIMIT 2
  `;

  // Recent proof: completions, verified OSS, projects.
  const recentNodes = await sql`
    SELECT r.completed_at, n.title FROM student_roadmap_progress r
    JOIN roadmap_nodes n ON n.id = r.node_id
    WHERE r.student_id = ${user?.id ?? ""} AND r.status = 'completed'
    ORDER BY r.completed_at DESC NULLS LAST LIMIT 3
  `;
  const recentOss = await sql`
    SELECT pr_url, title, verified_at, status FROM student_oss_contributions
    WHERE student_id = ${user?.id ?? ""}
    ORDER BY created_at DESC LIMIT 2
  `;
  const recentProjects = await sql`
    SELECT id, title, description, status, repo_url, tags, created_at FROM projects
    WHERE owner_id = ${user?.id ?? ""}
    ORDER BY created_at DESC LIMIT 3
  `;
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

  // Notifications preview: unread first, then newest. Mark-read stays in the
  // inbox drawer + notifications page — home only links.
  const notificationsPreview = await sql`
    SELECT id, type, title, body, link, read_at, created_at FROM notifications
    WHERE user_id = ${user?.id ?? ""}
    ORDER BY read_at NULLS FIRST, created_at DESC LIMIT 5
  `;
  const [notifUnread] = await sql`
    SELECT COUNT(*)::int AS c FROM notifications
    WHERE user_id = ${user?.id ?? ""} AND read_at IS NULL
  `;

  // Achievements preview: earned badges + source achievements (real rows only).
  const achievementsPreview = await sql`
    SELECT a.id, a.level, a.source_type, a.evidence_url, a.earned_at,
      b.name AS badge_name, b.tier AS badge_tier
    FROM student_achievements a LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.student_id = ${user?.id ?? ""}
    ORDER BY a.earned_at DESC LIMIT 4
  `;
  const [achievementCount] = await sql`
    SELECT COUNT(*)::int AS c FROM student_achievements WHERE student_id = ${user?.id ?? ""}
  `;
  const [credentialCount] = await sql`
    SELECT COUNT(*)::int AS c FROM verifiable_credentials WHERE student_id = ${user?.id ?? ""}
  `;

  // Growth story (insights folded in): latest snapshot + peers.
  const [snapshot] = await sql`
    SELECT * FROM student_analytics_snapshots WHERE student_id = ${user?.id ?? ""}
    ORDER BY snapshot_date DESC LIMIT 1
  `;
  let peers = null;
  if (snapshot) {
    [peers] = await sql`
      SELECT COALESCE(AVG(consistency_score),0)::numeric AS ac, COUNT(*)::int AS n
      FROM student_analytics_snapshots
      WHERE tenant_id = ${tenant?.id ?? null}::uuid AND snapshot_date = CURRENT_DATE AND student_id <> ${user?.id ?? ""}
    `;
  }

  // The generational loop: where the student stands between Beginner and Mentor.
  const [mentorRow] = await sql`SELECT user_id FROM mentors WHERE user_id = ${user?.id ?? ""} LIMIT 1`;
  const isMentor = !!mentorRow;
  const eligibility = user?.id ? await eligibilityFor(sql, user.id).catch(() => null) : null;
  const [application] = user?.id ? await sql`
    SELECT status, created_at FROM mentor_applications WHERE student_id = ${user.id}
    ORDER BY created_at DESC LIMIT 1
  ` : [];
  const myProjects = await sql`SELECT COUNT(*)::int AS c FROM projects WHERE owner_id = ${user?.id ?? ""}`;
  const [mySolutions] = await sql`
    SELECT COUNT(*)::int AS c FROM forum_replies
    WHERE author_id = ${user?.id ?? ""} AND is_answer = true AND status = 'visible'
  `;
  const stageIndex = isMentor ? 5
    : doneCount === 0 ? 0
    : (mySolutions?.c ?? 0) > 0 ? 4
    : (myProjects[0]?.c ?? 0) > 0 ? 3
    : doneCount >= 3 ? 2 : 1;
  const openThreads = await sql`
    SELECT t.id, t.title, t.reply_count FROM forum_threads t
    WHERE t.tenant_id = ${tenant?.id ?? null}::uuid AND t.status = 'visible'
      AND t.reply_count = 0 AND (t.domain = ${profile?.primary_domain ?? "general"} OR t.domain = 'general')
    ORDER BY t.created_at DESC LIMIT 3
  `;

  // The weekly rhythm: six cadences, each with a live pulse.
  const [nextWorkshop] = await sql`
    SELECT title, starts_at FROM events
    WHERE tenant_id = ${tenant?.id ?? null}::uuid AND starts_at >= NOW() AND status <> 'cancelled'
    ORDER BY starts_at ASC LIMIT 1
  `;
  const [openContests] = await sql`
    SELECT COUNT(*)::int AS c FROM contests
    WHERE status IN ('open', 'published') AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
  `;
  const [mentorCount] = await sql`
    SELECT COUNT(*)::int AS c FROM mentors
    WHERE available = true AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
  `;
  const [talkCount] = await sql`
    SELECT COUNT(*)::int AS c FROM events
    WHERE tenant_id = ${tenant?.id ?? null}::uuid AND event_type = 'talk'
      AND starts_at >= NOW() - INTERVAL '2 hours' AND status <> 'cancelled'
  `;
  const [ossCount] = await sql`
    SELECT COUNT(*)::int AS c FROM open_source_projects
    WHERE is_curated = true AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)
  `;
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
        notificationsPreview={notificationsPreview}
        notifUnread={notifUnread?.c ?? 0}
        projectsPreview={recentProjects}
        projectCount={myProjects[0]?.c ?? 0}
        achievementsPreview={achievementsPreview}
        achievementCount={achievementCount?.c ?? 0}
        credentialCount={credentialCount?.c ?? 0}
        snapshot={snapshot}
        peers={peers}
        loop={loop}
        cadence={cadence}
      />
    </AppShell>
  );
}
