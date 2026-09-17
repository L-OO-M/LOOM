import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { eligibilityFor } from "@/lib/mentorship";
import { enrichMentors, availabilityMap } from "@/lib/mentors";
import { AppShell } from "@/components/AppShell";
import { Meta, Display } from "@/components/loom/primitives";
import { ApplyForm } from "./ApplyForm";
import { MentorsExplorer } from "./_components/MentorsExplorer";

export default async function MentorshipPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/mentorship");
  const { user, tenant, sql } = ctx;

  const rows = await sql`
    SELECT m.*, p.name AS mentor_name, p.branch, p.year
    FROM mentors m LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE (m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) AND m.available = true
    ORDER BY m.created_at DESC LIMIT 100
  `;
  const mentors = await enrichMentors(sql, rows);
  const availability = await availabilityMap(sql, mentors.map((m) => m.user_id));

  const [upcoming] = await sql`
    SELECT COUNT(*)::int AS c FROM mentor_sessions
    WHERE student_id = ${user.id} AND status IN ('requested','scheduled')
  `;
  const [mentorRow] = await sql`SELECT user_id FROM mentors WHERE user_id = ${user.id} LIMIT 1`;
  const eligibility = await eligibilityFor(sql, user.id).catch(() => null);
  const [application] = await sql`
    SELECT status, created_at FROM mentor_applications WHERE student_id = ${user.id}
    ORDER BY created_at DESC LIMIT 1
  `;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Meta>Connect · guidance from seniors</Meta>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <Display size="lg">Mentors</Display>
          <div className="flex flex-wrap gap-2">
            <Link href="/student/mentorship/sessions" prefetch={false} className="btn-ghost !py-2 text-[13px]">
              My Sessions{upcoming?.c > 0 ? ` · ${upcoming.c}` : ""}
            </Link>
            {mentorRow && (
              <Link href="/student/mentorship/manage" prefetch={false} className="btn-ghost !py-2 text-[13px]">
                Mentor Dashboard
              </Link>
            )}
          </div>
        </div>
        <p className="narrative mt-2">Connect with experienced mentors and get guidance for your learning and career.</p>

        <div className="mt-6">
          <MentorsExplorer initialMentors={mentors} initialAvailability={availability} />
        </div>

        <section className="mt-12 border-t pt-10" style={{ borderColor: "var(--line)" }} aria-label="Become a mentor">
          <Meta>The generational cycle</Meta>
          <h2 className="h-product mt-2">One day, the guide is you.</h2>
          {mentorRow ? (
            <p className="narrative mt-3" style={{ color: "var(--text)" }}>
              You already mentor. Juniors find you here — keep your expertise honest and your door open.
            </p>
          ) : application?.status === "pending" ? (
            <p className="narrative mt-3">
              Your application is <strong style={{ color: "var(--accent)" }}>under review</strong> since{" "}
              {new Date(application.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}.
              Reviewers judge proof, not promises.
            </p>
          ) : eligibility?.eligible ? (
            <>
              <p className="narrative mt-3" style={{ color: "var(--text)" }}>
                Your proof speaks — {eligibility.stats.pct}% of the path, {eligibility.stats.proof} public contribution{eligibility.stats.proof === 1 ? "" : "s"}.
                Apply, and the loop continues through you.
              </p>
              <ApplyForm />
            </>
          ) : (
            <>
              <p className="narrative mt-3">
                Mentor candidacy is earned in public: {eligibility?.stats.pct ?? 0}% of the path walked
                {eligibility?.reasons?.length ? ` — still needed: ${eligibility.reasons.join("; ")}` : ""}.
              </p>
              <div className="mt-4 flex flex-wrap gap-6">
                <span className="meta">{eligibility?.stats.done ?? 0}/{eligibility?.stats.nodes ?? 0} milestones</span>
                <span className="meta">{eligibility?.stats.oss ?? 0} verified merges</span>
                <span className="meta">{eligibility?.stats.solutions ?? 0} solutions</span>
                <span className="meta">{eligibility?.stats.projects ?? 0} projects</span>
              </div>
            </>
          )}
        </section>
      </main>
    </AppShell>
  );
}
