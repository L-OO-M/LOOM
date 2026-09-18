import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { eligibilityFor } from "@/lib/mentorship";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, ActionLink, StatusPill } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { OnboardingState } from "@/components/loom/States";
import { ApplyForm } from "./ApplyForm";
import { MentorsBrowser } from "./_components/MentorsBrowser";

export const dynamic = "force-dynamic";

function sessionCopy(s) {
  if (s.status === "scheduled") {
    return { state: "now", pill: "live", label: "Scheduled", body: "On the calendar. Bring one sharp question." };
  }
  if (s.status === "completed") {
    return { state: "done", pill: "", label: "Completed", body: "Session completed. The best thanks is passing it on." };
  }
  if (s.status === "cancelled") {
    return { state: "todo", pill: "", label: "Cancelled", body: "Session cancelled." };
  }
  return { state: "now", pill: "", label: "Requested", body: "Your request is waiting for the mentor to pick it up. You'll be notified." };
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

export default async function MentorshipPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/mentorship");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const mentorRows = await sql`
    SELECT m.id, m.user_id, m.expertise, m.bio, m.created_at,
      p.name as mentor_name, p.primary_domain, p.year, p.branch,
      up.username as profile_username, up.is_public as profile_public, up.tenant_id as profile_tenant,
      (SELECT COUNT(*)::int FROM mentor_sessions s WHERE s.mentor_id = m.user_id) AS session_count,
      (SELECT COUNT(*)::int FROM mentor_reviews r WHERE r.mentor_id = m.user_id) AS review_count,
      (SELECT COALESCE(AVG(rating),0)::numeric FROM mentor_reviews r WHERE r.mentor_id = m.user_id) AS avg_rating
    FROM mentors m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    LEFT JOIN user_profiles up ON up.user_id = m.user_id
    WHERE (m.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AND m.available = true
    ORDER BY m.created_at DESC LIMIT 50
  `;
  const sessionRows = await sql`
    SELECT s.id, s.status, s.scheduled_at, p.name as mentor_name FROM mentor_sessions s
    LEFT JOIN profiles p ON p.user_id = s.mentor_id
    WHERE s.student_id = ${user.id}
    ORDER BY s.scheduled_at DESC NULLS LAST, s.id DESC LIMIT 10
  `;
  // The far end of the loop: candidacy computed from evidence.
  const [mentorRow] = await sql`SELECT user_id FROM mentors WHERE user_id = ${user.id} LIMIT 1`;
  const eligibility = await eligibilityFor(sql, user.id).catch(() => null);
  const [application] = await sql`
    SELECT status, created_at FROM mentor_applications WHERE student_id = ${user.id}
    ORDER BY created_at DESC LIMIT 1
  `;
  let mentoringLive = 0;
  if (tid) {
    const [{ n = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS n FROM events
      WHERE tenant_id = ${tid}::uuid AND event_type = 'mentoring' AND status <> 'cancelled'
        AND starts_at >= NOW() - interval '2 hours'
    `;
    mentoringLive = n;
  }

  // Plain JSON for the client island. Profile links only when the public
  // card contract permits: a username, marked public, same chapter.
  const mentors = mentorRows.map((m) => {
    const sameChapter = !m.profile_tenant || String(m.profile_tenant) === String(tid);
    const linkable = Boolean(m.profile_username && m.profile_public && sameChapter);
    return {
      id: String(m.id),
      user_id: String(m.user_id),
      expertise: m.expertise || "",
      bio: m.bio || "",
      created_at: m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at ?? ""),
      mentor_name: m.mentor_name || "Mentor",
      primary_domain: m.primary_domain || "",
      year: m.year ?? null,
      branch: m.branch || "",
      profile_username: linkable ? String(m.profile_username) : null,
      session_count: Number(m.session_count) || 0,
      review_count: Number(m.review_count) || 0,
      avg_rating: Number(m.avg_rating) || 0
    };
  });
  const sessions = sessionRows.map((s) => ({
    id: String(s.id),
    status: String(s.status || "requested"),
    scheduled_at: s.scheduled_at instanceof Date ? s.scheduled_at.toISOString() : s.scheduled_at ? String(s.scheduled_at) : null,
    mentor_name: s.mentor_name || "Mentor session"
  }));

  const stats = eligibility?.stats ?? null;
  const pct = stats ? Math.min(100, Math.max(0, Number(stats.pct) || 0)) : 0;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Connect · guidance from seniors</Meta>
        <Display size="lg" className="mt-3">Learn from someone who remembers the first step.</Display>
        <p className="narrative mt-4" style={{ color: "var(--text)" }}>
          Browse guides, request a session, and get notified when someone picks it up.
        </p>

        {sessions.length > 0 && (
          <section className="mt-10" aria-label="Your requests">
            <Meta>Your requests · {sessions.length}</Meta>
            <Timeline className="mt-5">
              {sessions.map((s) => {
                const c = sessionCopy(s);
                const when = s.status === "scheduled" ? fmtDateTime(s.scheduled_at) : fmtDate(s.scheduled_at);
                return (
                  <TimelineItem
                    key={s.id}
                    state={c.state}
                    title={s.mentor_name}
                    meta={when || c.label}
                    body={c.body}
                    action={<StatusPill tone={c.pill}>{when ? `${c.label} · ${when}` : c.label}</StatusPill>}
                  />
                );
              })}
            </Timeline>
          </section>
        )}

        <section className="mt-12" aria-label="Find a guide">
          <Meta>Available guides · {mentors.length}</Meta>
          <h2 className="h-product mt-2">Find a guide</h2>
          <p className="narrative mt-3" style={{ color: "var(--text)" }}>
            People who are already walking the path you want to explore.
          </p>
          {mentors.length === 0 ? (
            <OnboardingState
              eyebrow="Mentors"
              title="No guides yet."
              why="Your college hasn't added mentors. Ask an admin to invite seniors from the admin workspace — mentorship starts the day the first guide appears."
            />
          ) : (
            <MentorsBrowser mentors={mentors} />
          )}
        </section>

        <section className="mt-12 border-t pt-10" style={{ borderColor: "var(--line)" }} aria-label="Become a guide">
          <Meta>The generational cycle</Meta>
          <h2 className="h-product mt-2">Become a guide</h2>
          <p className="narrative mt-3" style={{ color: "var(--text)" }}>
            The next person you help may be where you were a year ago.
          </p>
          {mentorRow ? (
            <p className="narrative mt-4" style={{ color: "var(--text)" }}>
              You already mentor. Juniors find you here — keep your expertise honest and your door open.
            </p>
          ) : application?.status === "pending" ? (
            <div className="mt-4">
              <StatusPill tone="live">Under review</StatusPill>
              <p className="narrative mt-3">
                Your application has been under review since{" "}
                {new Date(application.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}.
                Reviewers judge proof, not promises — you’ll be notified here.
              </p>
            </div>
          ) : eligibility?.eligible ? (
            <div className="mt-6 max-w-xl">
              <div
                className="h-1.5 overflow-hidden rounded-full"
                role="img"
                aria-label={`Roadmap ${stats.pct} percent complete`}
                style={{ background: "var(--bg-muted)" }}
              >
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
              </div>
              <p className="narrative mt-3" style={{ color: "var(--text)" }}>
                Your proof speaks — {stats.pct}% of the path, {stats.proof} public contribution{stats.proof === 1 ? "" : "s"}.
                Apply, and the loop continues through you.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <span className="meta">{stats.done}/{stats.nodes} milestones</span>
                <span className="meta">{stats.oss} verified merges</span>
                <span className="meta">{stats.solutions} solutions</span>
                <span className="meta">{stats.projects} projects</span>
              </div>
              <ApplyForm />
            </div>
          ) : (
            <div className="mt-6 max-w-xl">
              <div
                className="h-1.5 overflow-hidden rounded-full"
                role="img"
                aria-label={`Roadmap ${pct} percent complete`}
                style={{ background: "var(--bg-muted)" }}
              >
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
              </div>
              <p className="narrative mt-3">
                Mentor candidacy is earned in public: {stats?.pct ?? 0}% of the path walked.
              </p>
              {eligibility?.reasons?.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {eligibility.reasons.map((r) => (
                    <li key={r} className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>· {r}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <span className="meta">{stats?.done ?? 0}/{stats?.nodes ?? 0} milestones</span>
                <span className="meta">{stats?.oss ?? 0} verified merges</span>
                <span className="meta">{stats?.solutions ?? 0} solutions</span>
                <span className="meta">{stats?.projects ?? 0} projects</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
                <ActionLink href="/student/roadmap">Continue the roadmap</ActionLink>
                <ActionLink href="/student/opensource">Earn a merge</ActionLink>
                <ActionLink href="/student/projects">Ship a project</ActionLink>
              </div>
            </div>
          )}
        </section>

        <section className="mt-12 border-t pt-10" style={{ borderColor: "var(--line)" }} aria-label="Where next">
          <Meta>Connect · keep going</Meta>
          <ol className="mt-2">
            <li className="border-b py-5 first:border-t" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-2">
                <div className="min-w-0">
                  <p className="text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>Ask the community</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                    Stuck on something specific? A sharp question gets a fast answer.
                  </p>
                </div>
                <ActionLink href="/student/community/forums">Open forums</ActionLink>
              </div>
            </li>
            <li className="border-b py-5" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-2">
                <div className="min-w-0">
                  <p className="text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>Learn live</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                    {mentoringLive > 0
                      ? "Mentoring gatherings are on the calendar — learn with others in the room."
                      : "Workshops and hackathons worth leaving your room for."}
                  </p>
                </div>
                <ActionLink href="/student/events">See events</ActionLink>
              </div>
            </li>
            <li className="border-b py-5" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-2">
                <div className="min-w-0">
                  <p className="text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>See rising builders</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                    Builders earning proof right now — follow their work.
                  </p>
                </div>
                <ActionLink href="/student/discover">Open discover</ActionLink>
              </div>
            </li>
          </ol>
        </section>
      </main>
    </AppShell>
  );
}
