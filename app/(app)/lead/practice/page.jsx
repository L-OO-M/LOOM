import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Meta, StatusPill } from "@/components/loom/primitives";
import { WorkspaceEmpty, WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { PracticeWeekEditor } from "@/components/practice/PracticeWeekEditor";
import { weekStart } from "@/lib/practice-domain";
import { canAuthorPractice, findPracticeDepartment, loadPracticeAdminSnapshot } from "@/lib/practice";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

function when(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default async function LeadPracticePage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/lead/practice");
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student");

  const department = await findPracticeDepartment(sql, tenant.id);
  if (!canAuthorPractice(profile, department).ok) redirect("/lead/overview");

  const snapshot = await loadPracticeAdminSnapshot(sql, { tenantId: tenant.id });
  const scheduled = snapshot.weeks.filter((week) => week.status === "scheduled").length;
  const stale = snapshot.connections.filter(
    (connection) => !connection.lastSyncAt || snapshot.now - connection.lastSyncAt > 2 * 60 * 60_000
  ).length;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker="Programs / DSA practice"
          title="Practice room"
          lede="Author the weekly seven for the DSA department and watch the LeetCode sync. Released weeks are locked; admin records corrections."
          meta={`${scheduled} scheduled / ${snapshot.connections.length} linked members / ${snapshot.members.length} members`}
          stats={[
            { value: snapshot.weeks.length, label: "weeks authored" },
            { value: scheduled, label: "scheduled or released" },
            { value: snapshot.connections.length, label: "LeetCode links" },
            { value: stale, label: "stale over 2h" }
          ]}
        />

        <WorkspaceSection
          index="01"
          title="Weekly assignments"
          note="Seven questions per scheduled week. Future sets stay private until their Monday."
        >
          <PracticeWeekEditor
            weeks={snapshot.weeks}
            questions={snapshot.questions}
            now={snapshot.now}
            currentWeekStart={weekStart(snapshot.now)}
          />
        </WorkspaceSection>

        <WorkspaceSection
          index="02"
          title="Recent corrections"
          note="Admin-only. A correction overrides automatic checks for one member and one question."
        >
          {snapshot.corrections.length === 0 ? (
            <WorkspaceEmpty title="No corrections recorded." body="Missed or wrongly counted solves will appear here after an admin records the evidence." />
          ) : (
            <ul className="mt-4 space-y-2">
              {snapshot.corrections.slice(0, 8).map((correction) => (
                <li key={correction.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {correction.memberName} / {correction.questionTitle}
                    </p>
                    <StatusPill>{correction.credited ? "credit granted" : "credit removed"}</StatusPill>
                  </div>
                  <p className="meta mt-1">{correction.weekTitle} / {when(correction.updatedAt)}</p>
                  <p className="narrative mt-2 text-sm leading-6">{correction.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          index="03"
          title="Sync health"
          note="Automatic checks run about hourly. Manual refreshes have a 15-minute cooldown."
        >
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div>
              <Meta>Members</Meta>
              {snapshot.connections.length === 0 ? (
                <WorkspaceEmpty title="No LeetCode links yet." body="Students link their own username from the practice room." />
              ) : (
                <ul className="mt-3 space-y-2">
                  {snapshot.connections.map((connection) => (
                    <li key={connection.userId} className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                          {connection.name} <span className="meta">@{connection.username}</span>
                        </p>
                        <StatusPill>{connection.syncState}</StatusPill>
                      </div>
                      <p className="meta mt-1">Last checked {when(connection.lastSyncAt)} / failures {connection.failures}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <Meta>Recent runs</Meta>
              {snapshot.runs.length === 0 ? (
                <WorkspaceEmpty title="No sync runs recorded." body="The practice-sync job writes a run row each time it checks LeetCode." />
              ) : (
                <ul className="mt-3 space-y-2">
                  {snapshot.runs.map((run) => (
                    <li key={run.id} className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{run.kind} / {when(run.startedAt)}</p>
                        <StatusPill>{run.completedAt ? "completed" : "interrupted"}</StatusPill>
                      </div>
                      <p className="meta mt-1">{run.checked} checked / {run.successful} successful / {run.failed} failed</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
