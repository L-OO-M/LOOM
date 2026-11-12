import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { ActionLink, Meta, StatusPill } from "@/components/loom/primitives";
import { WorkspaceEmpty, WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { LearnTabs } from "@/components/student/SectionRails";
import { loadPracticeSnapshot } from "@/lib/practice";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

function day(value) {
  return value
    ? new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })
    : "";
}

function monthLabel(value) {
  return new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });
}

function initials(name) {
  return String(name || "Member")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Board({ rows, userId, emptyTitle, emptyBody }) {
  const scored = rows.filter((member) => member.score > 0);
  if (!scored.length) {
    return <WorkspaceEmpty title={emptyTitle} body={emptyBody} />;
  }
  return (
    <ol className="mt-4 space-y-2">
      {rows.map((member) => (
        <li
          key={member.id}
          className="flex items-center gap-3 rounded-xl border p-3.5"
          style={{
            borderColor: member.id === userId ? "var(--accent)" : "var(--line)",
            background: "var(--bg-elevated)",
            opacity: member.score > 0 ? 1 : 0.62
          }}
        >
          <span className="mono-tag w-8 text-center">{String(member.rank).padStart(2, "0")}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold" style={{ borderColor: "var(--line)" }}>
            {initials(member.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium" style={{ color: "var(--text)" }}>
              {member.name}
              {member.id === userId ? <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--accent)" }}>you</span> : null}
            </span>
            <span className="meta">
              {member.username ? `@${member.username}` : "LeetCode not linked"}
              {member.role && member.role !== "student" ? <span className="dot-sep">{member.role.replaceAll("_", " ")}</span> : null}
            </span>
          </span>
          <span className="figure figure-mono text-lg">{member.score}<span className="meta ml-1">pts</span></span>
        </li>
      ))}
    </ol>
  );
}

export default async function PracticeLeaderboardPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/practice/leaderboard");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student/onboarding");

  const snapshot = await loadPracticeSnapshot(sql, {
    tenantId: tenant.id,
    userId: user.id
  });
  const weeklyLabel = snapshot.current
    ? `${day(snapshot.current.startAt)} - ${day(snapshot.current.endAt - 1)}`
    : "No set published yet";
  const monthlyLabel = monthLabel(snapshot.monthStart);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker="Learn / practice room / board"
          title="A little friendly competition."
          lede="Weekly and monthly points come only from assigned questions solved inside their week. Equal scores share a rank."
          meta={`${snapshot.members.length} members / one accepted solve = one point`}
          stats={[
            { value: snapshot.weeklyRanking.filter((member) => member.score > 0).length, label: "on the weekly board" },
            { value: snapshot.monthlyRanking.filter((member) => member.score > 0).length, label: "on the monthly board" },
            { value: snapshot.history.length, label: "past weeks open" },
            { value: 7, label: "questions per week" }
          ]}
        />

        <LearnTabs active="/student/practice" />

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <ActionLink href="/student/practice">Back to this week</ActionLink>
          <ActionLink href="/student/leaderboard">Chapter standing</ActionLink>
        </div>

        <WorkspaceSection index="01" title="This week" note={weeklyLabel}>
          <Board
            rows={snapshot.weeklyRanking}
            userId={user.id}
            emptyTitle="No practice points this week yet."
            emptyBody="The board opens when the first assigned solve is recorded."
          />
        </WorkspaceSection>

        <WorkspaceSection index="02" title="This month" note={`${monthlyLabel} / submission date in IST`}>
          <Board
            rows={snapshot.monthlyRanking}
            userId={user.id}
            emptyTitle="No practice points this month yet."
            emptyBody="Weekly solves roll into the monthly board automatically."
          />
        </WorkspaceSection>

        <WorkspaceSection index="03" title="The rules">
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <Meta>How points work</Meta>
              <ul className="narrative mt-3 space-y-2 text-sm leading-6">
                <li>Submit during the assignment week, even if you solved the question before.</li>
                <li>Only the assigned questions count.</li>
                <li>One accepted solve per question, per member.</li>
                <li>Equal scores share a rank.</li>
                <li>Monthly points follow the submission date in IST.</li>
              </ul>
            </div>
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <StatusPill>not chapter standing</StatusPill>
              <p className="narrative mt-3 text-sm leading-6">
                Practice points reward showing up. Chapter standing counts verified evidence such as merged pull requests, confirmed roadmap milestones, contests and debug challenge fixes.
              </p>
              <Link href="/student/leaderboard" prefetch={false} className="mt-4 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                See how chapter standing works
              </Link>
            </div>
          </div>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
