import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceEmpty, WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { DebugReviewCard } from "@/components/debug/DebugReviewCard";
import { debugChallengeRepo, loadDebugAdminSnapshot } from "@/lib/debug";
import { DebugChallengeForm } from "./_components/DebugChallengeForm";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

export default async function AdminDebugPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) redirect("/login?redirect=/admin/debug");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/login?redirect=/admin/debug");

  const snapshot = await loadDebugAdminSnapshot(sql, tenant.id);
  const published = snapshot.challenges.filter((challenge) => challenge.isPublished).length;
  const waiting = snapshot.submissions.filter((submission) => submission.reviewStatus === "submitted").length;
  const approved = snapshot.submissions.filter((submission) => submission.reviewStatus === "approved").length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker="Programs / debug"
          title="Debug & build"
          lede="Author real challenges against the external starter repository, then review verified forks. Publishing sets the fork-created-after timestamp."
          meta={`${debugChallengeRepo()} / ${published} published / ${waiting} waiting`}
          stats={[
            { value: snapshot.challenges.length, label: "challenges authored" },
            { value: published, label: "published" },
            { value: waiting, label: "waiting for review" },
            { value: approved, label: "approved fixes" }
          ]}
        />

        <WorkspaceSection
          index="01"
          title="Challenge catalogue"
          note="The repository content is external. Author the challenge here only after the bug exists and is reproducible."
        >
          <DebugChallengeForm challenges={snapshot.challenges} />
        </WorkspaceSection>

        <WorkspaceSection
          index="02"
          title="Submissions"
          note="Admins can review any domain. Approval records debug evidence; returning revokes a previous approval."
        >
          {snapshot.submissions.length === 0 ? (
            <WorkspaceEmpty
              title="No debug submissions yet."
              body="A submission appears after a member forks a published challenge and passes the automated ownership check."
            />
          ) : (
            <ul className="mt-4 grid gap-3">
              {snapshot.submissions.map((submission) => (
                <DebugReviewCard key={submission.id} submission={submission} />
              ))}
            </ul>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
