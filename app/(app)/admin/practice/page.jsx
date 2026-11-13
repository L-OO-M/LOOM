import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Meta, StatusPill } from "@/components/loom/primitives";
import { WorkspaceEmpty, WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { PracticeWeekEditor } from "@/components/practice/PracticeWeekEditor";
import { weekStart } from "@/lib/practice-domain";
import { loadPracticeAdminSnapshot } from "@/lib/practice";
import { PracticeCorrectionForm } from "./_components/PracticeCorrectionForm";

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

export default async function AdminPracticePage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/practice");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/practice");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/login?redirect=/admin/practice");

  const snapshot = await loadPracticeAdminSnapshot(sql, { tenantId: tenant.id });
  const scheduled = snapshot.weeks.filter((week) => week.status === "scheduled").length;
  const failing = snapshot.connections.filter((connection) => connection.syncState === "error").length;
  const stale = snapshot.connections.filter(
    (connection) => !connection.lastSyncAt || snapshot.now - connection.lastSyncAt > 2 * 60 * 60_000
  ).length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Programs / practice / ${snapshot.weeks.length} weeks`}
          title="Practice room"
          lede="Author the weekly seven, correct a missed solve, and keep the LeetCode sync healthy. Released weeks are locked."
          meta={`${scheduled} scheduled / ${snapshot.connections.length} linked members / ${failing} sync errors`}
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
          title="Corrections"
          note="A correction overrides automatic checks for one member and one assigned question."
        >
          <PracticeCorrectionForm
            released={snapshot.released}
            questions={snapshot.questions}
            members={snapshot.members}
          />
          <div className="mt-6">
            <Meta>Recent corrections / {snapshot.corrections.length}</Meta>
            {snapshot.corrections.length === 0 ? (
              <WorkspaceEmpty
                title="No corrections recorded."
                body="When a solve was missed or wrongly counted, record the evidence and reason here."
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {snapshot.corrections.map((correction) => (
                  <li key={correction.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                        {correction.memberName} / {correction.questionTitle}
                      </p>
                      <StatusPill>{correction.credited ? "credit granted" : "credit removed"}</StatusPill>
                    </div>
                    <p className="meta mt-1">{correction.weekTitle} / {when(correction.updatedAt)}</p>
                    <p className="narrative mt-2 text-sm leading-6">{correction.reason}</p>
                    <a href={correction.evidenceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                      View evidence
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                  {snapshot.connections.map((connection) => {
                    const staleMember = !connection.lastSyncAt || snapshot.now - connection.lastSyncAt > 2 * 60 * 60_000;
                    return (
                      <li key={connection.userId} className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {connection.name} <span className="meta">@{connection.username}</span>
                          </p>
                          <span className="flex items-center gap-2">
                            {staleMember ? <StatusPill>stale</StatusPill> : null}
                            <StatusPill>{connection.syncState}</StatusPill>
                          </span>
                        </div>
                        <p className="meta mt-1">Last checked {when(connection.lastSyncAt)} / failures {connection.failures}</p>
                        {connection.syncError ? <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{connection.syncError}</p> : null}
                      </li>
                    );
                  })}
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
                      {run.errorSummary ? <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{run.errorSummary}</p> : null}
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
