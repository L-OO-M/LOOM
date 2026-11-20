import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead } from "@/components/loom/WorkspaceMasthead";
import { LearnTabs } from "@/components/student/SectionRails";
import { loadPracticeSnapshot } from "@/lib/practice";
import { loadPracticeProgress } from "@/lib/practice-progress";
import { PracticeClient } from "./_components/PracticeClient";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

export default async function StudentPracticePage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/practice");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student/onboarding");

  const snapshot = await loadPracticeSnapshot(sql, {
    tenantId: tenant.id,
    userId: user.id
  });
  const progress = await loadPracticeProgress(sql, {
    tenantId: tenant.id,
    userId: user.id,
    questions: snapshot.questions,
    now: snapshot.now
  });
  const currentQuestions = snapshot.questions.filter((question) => question.weekId === snapshot.current?.id);
  const solved = snapshot.credits.filter(
    (credit) => credit.userId === user.id && credit.weekId === snapshot.current?.id
  ).length;
  const weeklyRank = snapshot.current
    ? snapshot.weeklyRanking.find((member) => member.id === user.id)?.rank
    : null;
  const shared = snapshot.weeklyRanking.filter((member) => member.score > 0).length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Link
          href="/student/challenges"
          prefetch={false}
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          &larr; All challenges
        </Link>
        <WorkspaceMasthead
          kicker={`Learn / challenges / weekly core set / ${snapshot.members.length} members`}
          title="Consistency is a team sport."
          lede="Seven assigned questions each week. Solve on LeetCode inside the week and the accepted submission counts once. The board is a practice habit, not chapter standing."
          meta={snapshot.current ? `${snapshot.current.title} / ${solved} of ${currentQuestions.length || 7} recorded` : "Awaiting this week's set"}
          stats={[
            { value: solved, label: "recorded this week" },
            { value: weeklyRank ? `#${weeklyRank}` : "-", label: "weekly rank" },
            { value: shared, label: "members on the board" },
            { value: snapshot.history.length, label: "past weeks open" }
          ]}
        />
        <LearnTabs active="/student/roadmap" />
        <PracticeClient snapshot={snapshot} userId={user.id} progress={progress} />
      </main>
    </AppShell>
  );
}
