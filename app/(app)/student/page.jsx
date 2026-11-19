import { scope } from "@/lib/tenant-scope";
import { getRequestContext } from "@/lib/auth-server";
import { getSql } from "@/lib/db";
import { resolveRequestTenant } from "@/lib/tenant";
import { eligibilityFor } from "@/lib/mentorship";
import { nextStepForStudent } from "@/lib/roadmap-next";
import { splitVerifiedProgress } from "@/lib/roadmap";
import { normalizeDomainKey } from "@/lib/domains";
import { trackProgress } from "@/lib/tracks";
import { summarizeWeek, startOfWeek } from "@/lib/week-activity";
import { loadMomentum } from "@/lib/momentum";
import { toIsoDay } from "@/lib/github-activity";
import { relDay, relShort } from "@/lib/dates";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StudentDashboard } from "@/app/(app)/student/_components/StudentDashboard";

export default async function StudentPage() {
  // The layout already resolved (and cache()d) this context. Reading the
  // Supabase client here returned null for anyone signed in through Auth0, so
  // every per-user query below ran with an empty id and the page showed another
  // person's blank slate. ctx.user is the canonical id from either front door.
  const ctx = await getRequestContext();
  const user = ctx.user;

  const sql = getSql();
  // Chapter resolved from the request host (multi-chapter safe); demo slug
  // is only a fallback when host headers are absent (local dev, tests).
  const tenant = await resolveRequestTenant();

  const now = new Date();
  // `summarizeWeek` derives this same Monday key from `now`; computing it up
  // front lets the week's milestone count ride along in the single read below.
  const weekStart = toIsoDay(startOfWeek(now));

  // The student layout runs getRequestContext() first, which creates the
  // profile (with the domain the member actually picked) and seeds department
  // memberships on first login. This page only reads it — the former duplicate
  // INSERT here hardcoded primary_domain 'web' and could never win the race.
  //
  // ONE statement instead of twenty-nine. Every read below used to be its own
  // round trip, issued strictly one after another (AGENTS.md forbids Promise.all
  // here — the pooler runs on a ten-connection budget). At a measured ~49 ms per
  // round trip that serialisation cost ~1.4 s of this page's 5–6 s to DOM-ready.
  // The reads are independent, read-only slices of the same request, so they are
  // expressed as scalar subqueries over one snapshot: one round trip, same rows,
  // same shapes (json/jsonb comes back already parsed — see lib/auth-server.js).
  const [dash] = await sql`
    SELECT
      -- Profile + roadmap: the two reads every derivation below hangs off.
      (SELECT to_jsonb(p) FROM profiles p WHERE p.user_id = ${user?.id ?? ""} LIMIT 1) AS profile,
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT * FROM roadmap_nodes ORDER BY sort_order ASC
      ) j) AS nodes,
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT node_id, evidence_state FROM student_roadmap_progress
        WHERE student_id = ${user?.id ?? ""} AND status = 'completed'
      ) j) AS done,
      (SELECT coalesce(json_agg(t.domain), '[]'::json) FROM student_tracks t
       WHERE t.tenant_id = ${tenant?.id ?? null}::uuid AND t.user_id = ${user?.id ?? ""}) AS track_domains,

      -- This week: the daily strip and its verified-milestone count.
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT to_char(day, 'YYYY-MM-DD') AS day, commits, pull_requests, reviews FROM student_daily_activity
        WHERE student_id = ${user?.id ?? ""} AND day >= CURRENT_DATE - INTERVAL '6 days'
        ORDER BY day ASC
      ) j) AS week_rows,
      (SELECT COUNT(*)::int FROM student_roadmap_progress
       WHERE student_id = ${user?.id ?? ""} AND status = 'completed'
         AND evidence_state = 'verified'
         AND completed_at >= ${weekStart}::date) AS week_milestones,

      -- Coming up: upcoming events, then scheduled mentor sessions.
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT e.id, e.title, e.event_type, e.starts_at, e.location, e.is_online,
          EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user?.id ?? ""}) AS registered
        FROM events e
        WHERE e.tenant_id = ${tenant?.id ?? null}::uuid AND e.status IN ('upcoming', 'live')
          AND e.starts_at >= NOW() - INTERVAL '2 hours'
        ORDER BY e.starts_at ASC LIMIT 3
      ) j) AS events,
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT s.id, s.scheduled_at, s.status, m.expertise, p.name AS mentor_name
        FROM mentor_sessions s
        LEFT JOIN mentors m ON m.user_id = s.mentor_id
        LEFT JOIN profiles p ON p.user_id = s.mentor_id
        WHERE s.student_id = ${user?.id ?? ""} AND s.scheduled_at >= NOW() - INTERVAL '2 hours'
        ORDER BY s.scheduled_at ASC LIMIT 2
      ) j) AS sessions,

      -- Recent work. A roadmap tick is a claim until a lead verifies it, so
      -- each row carries its real state and the UI labels it honestly.
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT r.completed_at, r.evidence_state, n.title FROM student_roadmap_progress r
        JOIN roadmap_nodes n ON n.id = r.node_id
        WHERE r.student_id = ${user?.id ?? ""} AND r.status = 'completed'
        ORDER BY r.completed_at DESC NULLS LAST LIMIT 3
      ) j) AS recent_nodes,
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT pr_url, title, verified_at, status, created_at FROM student_oss_contributions
        WHERE student_id = ${user?.id ?? ""}
        ORDER BY created_at DESC LIMIT 2
      ) j) AS recent_oss,
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT id, title, description, status, repo_url, tags, created_at FROM projects
        WHERE owner_id = ${user?.id ?? ""}
        ORDER BY created_at DESC LIMIT 3
      ) j) AS recent_projects,

      -- Notifications preview: unread first, then newest. Mark-read stays in the
      -- inbox drawer + notifications page — home only links.
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT id, type, title, body, link, read_at, created_at FROM notifications
        WHERE user_id = ${user?.id ?? ""}
        ORDER BY read_at NULLS FIRST, created_at DESC LIMIT 5
      ) j) AS notifications,
      (SELECT COUNT(*)::int FROM notifications
       WHERE user_id = ${user?.id ?? ""} AND read_at IS NULL) AS notif_unread,

      -- Achievements preview (earned badges + source achievements, real rows
      -- only) and credential count.
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT a.id, a.level, a.source_type, a.evidence_url, a.earned_at,
          b.name AS badge_name, b.tier AS badge_tier
        FROM student_achievements a LEFT JOIN skill_badges b ON b.id = a.badge_id
        WHERE a.student_id = ${user?.id ?? ""}
        ORDER BY a.earned_at DESC LIMIT 4
      ) j) AS achievements,
      (SELECT COUNT(*)::int FROM student_achievements WHERE student_id = ${user?.id ?? ""}) AS achievement_count,
      (SELECT COUNT(*)::int FROM verifiable_credentials WHERE student_id = ${user?.id ?? ""}) AS credential_count,

      -- Growth story (insights folded in): latest snapshot + peers.
      (SELECT to_jsonb(s) FROM student_analytics_snapshots s
       WHERE s.student_id = ${user?.id ?? ""}
       ORDER BY s.snapshot_date DESC LIMIT 1) AS snapshot,
      (SELECT json_build_object(
         'ac', COALESCE(AVG(consistency_score),0)::numeric,
         'n', COUNT(*)::int
       ) FROM student_analytics_snapshots
       WHERE tenant_id = ${tenant?.id ?? null}::uuid AND snapshot_date = CURRENT_DATE AND student_id <> ${user?.id ?? ""}) AS peers,

      -- The generational loop: where the student stands between Beginner and Mentor.
      (SELECT true FROM mentors WHERE user_id = ${user?.id ?? ""} LIMIT 1) AS is_mentor,
      (SELECT json_build_object('status', status, 'created_at', created_at) FROM mentor_applications
       WHERE student_id = ${user?.id ?? ""} ORDER BY created_at DESC LIMIT 1) AS application,
      (SELECT COUNT(*)::int FROM projects WHERE owner_id = ${user?.id ?? ""}) AS project_count,
      (SELECT true FROM github_connections WHERE user_id = ${user?.id ?? ""} LIMIT 1) AS github_linked,
      (SELECT COUNT(*)::int FROM forum_replies
       WHERE author_id = ${user?.id ?? ""} AND is_answer = true AND status = 'visible') AS solution_count,
      -- The one filter that used to need the profile row in JS first: the same
      -- primary_domain-then-general fallback, resolved in SQL so this read does
      -- not depend on that row arriving before the statement is built.
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT t.id, t.title, t.reply_count FROM forum_threads t
        WHERE t.tenant_id = ${tenant?.id ?? null}::uuid AND t.status = 'visible'
          AND t.reply_count = 0
          AND (t.domain = coalesce((SELECT primary_domain FROM profiles WHERE user_id = ${user?.id ?? ""} LIMIT 1), 'general')
            OR t.domain = 'general')
        ORDER BY t.created_at DESC LIMIT 3
      ) j) AS open_threads,

      -- The tracker the dashboard was missing: what is actually open right now
      -- (this practice week), and whether the member turns up to events they
      -- registered for. Both are counts over real rows, never estimates.
      (SELECT json_build_object(
         'registered', COUNT(*)::int,
         'attended', COUNT(*) FILTER (WHERE r.attended_at IS NOT NULL)::int
       )
       FROM event_registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.student_id = ${user?.id ?? ""}
         AND e.tenant_id = ${tenant?.id ?? null}::uuid
         AND r.status <> 'cancelled') AS event_stats,
      (SELECT json_build_object(
         'title', w.title,
         'start_at', w.start_at,
         'end_at', w.end_at,
         'total', (SELECT COUNT(*)::int FROM practice_questions q
                   WHERE q.week_id = w.id AND q.tenant_id = w.tenant_id),
         'solved', (SELECT COUNT(DISTINCT s.question_id)::int
                    FROM practice_solves s
                    JOIN practice_questions q2 ON q2.id = s.question_id
                    WHERE s.user_id = ${user?.id ?? ""}
                      AND s.tenant_id = w.tenant_id
                      AND q2.week_id = w.id)
       )
       FROM practice_weeks w
       WHERE w.tenant_id = ${tenant?.id ?? null}::uuid
         AND w.status = 'scheduled'
         AND w.end_at >= NOW()
       ORDER BY w.start_at ASC LIMIT 1) AS practice_now,
      (SELECT COUNT(*)::int FROM student_oss_contributions
       WHERE student_id = ${user?.id ?? ""} AND tenant_id = ${tenant?.id ?? null}::uuid
         AND status = 'verified') AS oss_verified,

      -- Proof does not have to be lonely: the newest verified work from OTHER
      -- public members of this chapter. Real rows, linked to their real card.
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT * FROM (
          SELECT 'oss'::text AS kind, c.id::text AS id, c.title,
                 COALESCE(c.merged_at, c.verified_at, c.created_at) AS at,
                 up.username, up.avatar_url, p.name
          FROM student_oss_contributions c
          JOIN user_profiles up ON up.user_id = c.student_id AND up.is_public = true
          LEFT JOIN profiles p ON p.user_id = c.student_id
          WHERE c.tenant_id = ${tenant?.id ?? null}::uuid
            AND c.student_id <> ${user?.id ?? ""}
            AND c.status = 'verified'
          UNION ALL
          SELECT 'project'::text AS kind, pr.id::text AS id, pr.title,
                 pr.created_at AS at,
                 up.username, up.avatar_url, p.name
          FROM projects pr
          JOIN user_profiles up ON up.user_id = pr.owner_id AND up.is_public = true
          LEFT JOIN profiles p ON p.user_id = pr.owner_id
          WHERE pr.tenant_id = ${tenant?.id ?? null}::uuid
            AND pr.owner_id <> ${user?.id ?? ""}
        ) feed
        ORDER BY at DESC NULLS LAST
        LIMIT 3
      ) j) AS peer_proof,

      -- The weekly rhythm: one live pulse per cadence.
      (SELECT json_build_object('title', title, 'starts_at', starts_at) FROM events
       WHERE tenant_id = ${tenant?.id ?? null}::uuid AND starts_at >= NOW() AND status <> 'cancelled'
       ORDER BY starts_at ASC LIMIT 1) AS next_workshop,
      (SELECT COUNT(*)::int FROM contests
       WHERE status IN ('open', 'published') AND tenant_id = ${scope(tenant?.id ?? null)}::uuid) AS open_contests,
      (SELECT COUNT(*)::int FROM mentors
       WHERE available = true AND tenant_id = ${scope(tenant?.id ?? null)}::uuid) AS mentor_count,
      (SELECT COUNT(*)::int FROM events
       WHERE tenant_id = ${tenant?.id ?? null}::uuid AND event_type = 'talk'
         AND starts_at >= NOW() - INTERVAL '2 hours' AND status <> 'cancelled') AS talk_count,
      (SELECT COUNT(*)::int FROM open_source_projects
       WHERE is_curated = true AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)) AS oss_count,

      -- The contest strip, itemised. Deliberately last: tests/tenant-scoping-gate
      -- asserts this query carries its tenant predicate, and reads everything
      -- from the contest FROM clause to the end of the statement.
      (SELECT coalesce(json_agg(j), '[]'::json) FROM (
        SELECT c.id, c.title, c.status, c.starts_at, c.ends_at,
          EXISTS(SELECT 1 FROM contest_registrations r WHERE r.contest_id = c.id AND r.student_id = ${user?.id ?? ""}) AS registered
        FROM contests c
        WHERE c.tenant_id = ${tenant?.id ?? null}::uuid
          AND c.status IN ('open', 'upcoming', 'published')
        ORDER BY c.starts_at ASC NULLS LAST LIMIT 3
      ) j) AS contests
  `;

  const profile = dash.profile ?? undefined;
  const nodes = dash.nodes ?? [];
  const done = dash.done ?? [];
  // A claim is visible in the UI, but it is not progress and it is not proof.
  // Only lead-confirmed evidence moves the percentage or the proof rail.
  const progress = splitVerifiedProgress(done);
  const verifiedIds = progress.verifiedIds;
  const provisionalCount = progress.provisionalIds.length;
  const doneCount = verifiedIds.length;
  const primaryDomain = normalizeDomainKey(profile?.primary_domain);
  // The hero, the journey and the percentage describe ONE track: the member's
  // primary roadmap. Nodes from other domains used to be spliced into the
  // five-stop window, so "up next" could jump into an unrelated track.
  const trackNodes = primaryDomain ? nodes.filter((node) => node.domain === primaryDomain) : nodes;
  const totalCount = trackNodes.length;
  const trackDone = trackNodes.filter((n) => verifiedIds.includes(n.id)).length;
  const overallPercent = totalCount > 0 ? Math.round((trackDone / totalCount) * 100) : 0;
  // Every roadmap the member follows, each with its own verified count.
  const tracks = trackProgress({
    nodes,
    verifiedIds,
    followed: dash.track_domains ?? [],
    primary: primaryDomain
  });
  // One source of truth: the same prerequisite-aware, verified-only walk the
  // roadmap page and the API use. The old `find(first uncompleted)` ignored
  // both prerequisites and the student's domain.
  const nextStep = user?.id
    ? await nextStepForStudent(sql, user.id, primaryDomain || null)
    : { node: null };
  const nextNode = nextStep.node;
  const nextMilestone = nextNode?.title ?? null;

  // This week: one Monday–Sunday strip from real daily activity. The helper
  // owns the window so the marks and the "sessions" total can never disagree
  // (the old query fetched 13 days and counted every active day as this week).
  const weekRows = dash.week_rows ?? [];
  const week = summarizeWeek(weekRows, now);
  const weekDays = week.days;
  const weekSessions = week.sessions;
  const weekContributions = week.contributions;
  const weekMilestones = dash.week_milestones ?? 0;

  // Coming up: open contests, upcoming events, scheduled mentor sessions.
  //
  // The "when" label is computed here, on the server, and passed down as a
  // string. Formatting it inside the dashboard (a client component, so it also
  // renders during hydration) is a hydration mismatch waiting to happen: the
  // Node process and the browser can be on different calendar dates, so
  // "Today"/"Tomorrow" and even "5 Dec" can disagree between the two renders.
  // See lib/dates.js.
  const contests = (dash.contests ?? []).map((c) => ({ ...c, when: relDay(c.ends_at || c.starts_at) }));
  const events = (dash.events ?? []).map((e) => ({ ...e, when: relDay(e.starts_at) }));
  const sessions = (dash.sessions ?? []).map((s) => ({ ...s, when: relDay(s.scheduled_at) }));

  // Recent work. A roadmap tick is a claim until a lead verifies the evidence,
  // so each row carries its real state and the UI labels it honestly.
  const recentNodes = dash.recent_nodes ?? [];
  const recentOss = dash.recent_oss ?? [];
  const recentProjects = dash.recent_projects ?? [];
  const proof = [
    ...recentNodes.filter((r) => r.evidence_state === "verified").map((r) => ({
      at: r.completed_at,
      when: r.completed_at ? new Date(r.completed_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "Recent",
      text: `completed ${r.title}`,
      meta: "Roadmap",
      state: "verified",
      href: "/student/roadmap"
    })),
    ...recentOss.map((o) => {
      const verified = !!(o.verified_at || o.status === "merged");
      return {
        at: o.verified_at || o.created_at,
        when: new Date(o.verified_at || o.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        text: verified ? `merged ${o.title || "a pull request"}` : `claimed ${o.title || "a pull request"}`,
        meta: "Open source",
        state: verified ? "verified" : "pending",
        href: o.pr_url || "/student/opensource"
      };
    }),
    ...recentProjects.map((p) => ({
      at: p.created_at,
      when: p.created_at ? new Date(p.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "Recent",
      text: `published ${p.title}`,
      meta: "Project",
      state: "self-reported",
      href: `/student/projects/${p.id}`
    }))
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, 5)
    .map(({ at, ...item }) => item);

  // Notifications preview: unread first, then newest. Mark-read stays in the
  // inbox drawer + notifications page — home only links.
  const notificationsPreview = dash.notifications ?? [];
  const notifUnread = dash.notif_unread ?? 0;

  // Achievements preview: earned badges + source achievements (real rows only).
  const achievementsPreview = dash.achievements ?? [];
  const achievementCount = dash.achievement_count ?? 0;
  const credentialCount = dash.credential_count ?? 0;

  // Growth story (insights folded in): latest snapshot + peers.
  const snapshot = dash.snapshot ?? null;
  const peers = dash.peers ?? null;

  // The generational loop: where the student stands between Beginner and Mentor.
  const isMentor = !!dash.is_mentor;
  const eligibility = user?.id ? await eligibilityFor(sql, user.id).catch(() => null) : null;
  const application = dash.application ?? null;
  const myProjects = dash.project_count ?? 0;
  const githubConnection = !!dash.github_linked;
  const mySolutions = dash.solution_count ?? 0;
  const stageIndex = isMentor ? 5
    : doneCount === 0 ? 0
    : mySolutions > 0 ? 4
    : myProjects > 0 ? 3
    : doneCount >= 3 ? 2 : 1;
  const openThreads = dash.open_threads ?? [];

  // The weekly rhythm: six cadences, each with a live pulse.
  const nextWorkshop = dash.next_workshop ?? null;
  const openContests = dash.open_contests ?? 0;
  const mentorCount = dash.mentor_count ?? 0;
  const talkCount = dash.talk_count ?? 0;
  const ossCount = dash.oss_count ?? 0;
  const cadence = {
    // `when` is already the rendered label: see the note above the upcoming-event
  // queries about why a relative date must not be formatted during hydration.
  workshop: nextWorkshop ? { title: nextWorkshop.title, when: relShort(nextWorkshop.starts_at) } : null,
    contests: openContests,
    mentors: mentorCount,
    projects: myProjects,
    talks: talkCount,
    oss: ossCount
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

  // Daily consistency, from rows the chapter already records. One extra read,
  // because the streak has to span 120 days, not just this week's seven.
  const momentum = await loadMomentum(sql, { userId: user?.id, tenantId: tenant?.id, today: now });
  const eventStats = dash.event_stats ?? { registered: 0, attended: 0 };
  const practiceNow = dash.practice_now
    ? {
        ...dash.practice_now,
        // Format on the server: a client render can sit in a different timezone
        // and produce a different date than the HTML it hydrates.
        closesLabel: new Date(dash.practice_now.end_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
      }
    : null;
  const ossVerified = dash.oss_verified ?? 0;
  const peerProof = (dash.peer_proof ?? []).map((p) => ({
    id: `${p.kind}-${p.id}`,
    kind: p.kind,
    title: p.title,
    name: p.name || p.username || "A chapter member",
    username: p.username,
    avatarUrl: p.avatar_url || null,
    when: p.at ? relShort(p.at) : "Recently",
    href: p.username ? `/u/${p.username}` : "/student/discover"
  }));

  const promoted = profile?.role === "vertical_lead" || profile?.role === "dept_lead" || profile?.role === "admin";
  const verticalLabel = profile?.role === "vertical_lead" ? (profile.vertical ? ` · ${profile.vertical.replace("_", " ")}` : "") : "";

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      {promoted && (
        <div className="mx-auto max-w-6xl px-4 pt-2 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "color-mix(in srgb, var(--accent) 18%, var(--line))", background: "color-mix(in srgb, var(--accent) 7%, var(--bg-elevated))" }}>
            <p className="text-sm" style={{ color: "var(--text)" }}>
              <span className="font-semibold">New capabilities unlocked</span>
              <span style={{ color: "var(--text-muted)" }}> — you&apos;re now {profile.role.replace("_", " ")}{verticalLabel}. {profile.role === "admin" ? "Admin overview" : "Lead console"} is available without signing out.</span>
            </p>
            <Link href={profile.role === "admin" ? "/admin" : "/lead"} prefetch={false} className="btn-ink !py-1.5 !px-4 text-sm shrink-0">
              Open {profile.role === "admin" ? "Admin" : "Lead"} →
            </Link>
          </div>
        </div>
      )}
      <StudentDashboard
        profile={profile}
        greeting={greeting}
        todayLabel={todayLabel}
        nextNode={nextNode}
        nodes={trackNodes.map((n) => ({ id: n.id, title: n.title }))}
        verifiedIds={verifiedIds}
        provisionalCount={provisionalCount}
        overallPercent={overallPercent}
        tracks={tracks}
        nextMilestone={nextMilestone}
        weekDays={weekDays}
        weekCounts={{ sessions: weekSessions, contributions: weekContributions, milestones: weekMilestones }}
        contests={contests}
        events={events}
        sessions={sessions}
        proof={proof}
        notificationsPreview={notificationsPreview}
        notifUnread={notifUnread}
        projectsPreview={recentProjects}
        projectCount={myProjects}
        githubConnected={githubConnection}
        achievementsPreview={achievementsPreview}
        achievementCount={achievementCount}
        credentialCount={credentialCount}
        snapshot={snapshot}
        peers={peers}
        loop={loop}
        cadence={cadence}
        momentum={momentum}
        eventStats={eventStats}
        practiceNow={practiceNow}
        ossVerified={ossVerified}
        peerProof={peerProof}
      />
    </AppShell>
  );
}
