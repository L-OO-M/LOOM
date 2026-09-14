import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { MentorRequestButton } from "@/components/actions";
import { Display, Meta, StatusPill } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { OnboardingState } from "@/components/loom/States";

export default async function MentorshipPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/mentorship");
  const { user, tenant, sql } = ctx;
  const mentors = await sql`
    SELECT m.*, p.name as mentor_name,
      (SELECT COUNT(*)::int FROM mentor_sessions s WHERE s.mentor_id = m.user_id) AS session_count,
      (SELECT COUNT(*)::int FROM mentor_reviews r WHERE r.mentor_id = m.user_id) AS review_count,
      (SELECT COALESCE(AVG(rating),0)::numeric FROM mentor_reviews r WHERE r.mentor_id = m.user_id) AS avg_rating
    FROM mentors m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE (m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) AND m.available = true
    ORDER BY m.created_at DESC LIMIT 50
  `;
  const sessions = await sql`
    SELECT s.*, p.name as mentor_name FROM mentor_sessions s
    LEFT JOIN profiles p ON p.user_id = s.mentor_id
    WHERE s.student_id = ${user.id}
    ORDER BY s.scheduled_at DESC NULLS LAST, s.id DESC LIMIT 10
  `;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Connect · guidance from seniors</Meta>
        <Display size="lg" className="mt-3">Learn from someone who remembers the first step.</Display>

        {sessions.length > 0 && (
          <section className="mt-10" aria-label="Your sessions">
            <Meta>Your sessions · {sessions.length}</Meta>
            <Timeline className="mt-5">
              {sessions.map((s) => (
                <TimelineItem
                  key={s.id}
                  state={s.status === "completed" ? "done" : s.status === "cancelled" ? "todo" : "now"}
                  title={s.mentor_name || "Mentor session"}
                  meta={s.scheduled_at ? new Date(s.scheduled_at).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" }) : s.status}
                  body={s.status === "scheduled" ? "On the calendar. Bring one sharp question." : s.status === "completed" ? "Done. The best thanks is passing it on." : `Status: ${s.status}`}
                />
              ))}
            </Timeline>
          </section>
        )}

        <section className="mt-12" aria-label="Mentors">
          <div className="flex items-baseline justify-between">
            <Meta>Available mentors · {mentors.length}</Meta>
          </div>
          {mentors.length === 0 ? (
            <OnboardingState
              eyebrow="Mentors"
              title="No guides yet."
              why="Your college hasn't added mentors. Ask an admin to invite seniors from the admin workspace — mentorship starts the day the first guide appears."
            />
          ) : (
            <ol className="mt-4">
              {mentors.map((m) => (
                <li key={m.id} className="border-b py-7 first:border-t" style={{ borderColor: "var(--line)" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>
                      {m.mentor_name || "Mentor"}
                    </p>
                    {Number(m.review_count) > 0 && (
                      <span className="meta">★ {Number(m.avg_rating).toFixed(1)} · {m.review_count} review{m.review_count === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  <p className="meta mt-2" style={{ color: "var(--accent)" }}>{m.expertise || "General guidance"}</p>
                  {m.bio && <p className="narrative mt-3" style={{ color: "var(--text)" }}>{m.bio}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <MentorRequestButton mentorId={m.user_id} />
                    {Number(m.session_count) > 0 && (
                      <span className="meta">{m.session_count} session{m.session_count === 1 ? "" : "s"} guided</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <p className="narrative mt-10">
          Good mentorship is specific. Request with a question in mind —{" "}
          <Link href="/student/community/forums" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            or ask the community first
          </Link>
          .
        </p>
      </main>
    </AppShell>
  );
}
