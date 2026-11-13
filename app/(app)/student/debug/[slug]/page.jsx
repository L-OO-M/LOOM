import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Meta, StatusPill } from "@/components/loom/primitives";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { BuildTabs } from "@/components/student/SectionRails";
import { debugChallengeRepo, loadDebugChallenge, loadMyDebugSubmissions } from "@/lib/debug";
import { DebugSubmissionForm } from "./_components/DebugSubmissionForm";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

export default async function StudentDebugChallengePage({ params }) {
  const { slug } = await params;
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=/student/debug/${slug}`);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student/onboarding");

  const challenge = await loadDebugChallenge(sql, tenant.id, slug);
  if (!challenge) notFound();

  const submissions = await loadMyDebugSubmissions(sql, tenant.id, user.id);
  const submission = submissions.find((item) => item.challengeId === challenge.id) || null;
  const repo = debugChallengeRepo();

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Build / debug room / ${challenge.domain}`}
          title={challenge.title}
          lede={challenge.brief ? "Read the failing behaviour, fix it in your own fork, then submit the fork for review." : "Open the starter repository, reproduce the bug, and submit your fork for review."}
          meta={`${challenge.difficulty} / ${challenge.repoPath}`}
          stats={[
            { value: challenge.difficulty, label: "difficulty" },
            { value: submission?.verificationStatus || "not submitted", label: "fork check" },
            { value: submission?.reviewStatus || "not reviewed", label: "review" },
            { value: challenge.isPublished ? "open" : "closed", label: "status" }
          ]}
        />

        <BuildTabs active="/student/debug" />

        <div className="mt-8">
          <Link href="/student/debug" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Back to debug challenges
          </Link>
        </div>

        <WorkspaceSection index="01" title="The brief" note={challenge.repoPath}>
          <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="narrative whitespace-pre-line text-sm leading-7">
              {challenge.brief || "The challenge brief lives in the starter repository. Read the README before changing code."}
            </p>
            <a
              href={`https://github.com/${repo}/tree/main/${challenge.repoPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-xs font-semibold hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Open starter repository
            </a>
          </div>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="How it will be checked">
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <Meta>Automated fork check</Meta>
              <ul className="narrative mt-3 space-y-2 text-sm leading-6">
                <li>Your linked GitHub account must own the fork.</li>
                <li>The repository must be a fork of <code>{repo}</code>.</li>
                <li>The fork must have been created after this challenge was published.</li>
                <li>At least one commit must come from your linked GitHub account.</li>
              </ul>
            </div>
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <Meta>Human review</Meta>
              <p className="narrative mt-3 text-sm leading-6">
                {challenge.verification || "Your domain lead checks that the bug is actually fixed and the change is yours. Approval adds debug evidence to chapter standing."}
              </p>
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection
          index="03"
          title="Submit your fork"
          note={submission ? `Current state: ${submission.reviewStatus}` : "Paste a public fork URL"}
          action={<StatusPill>{submission ? submission.verificationStatus : "not started"}</StatusPill>}
        >
          <DebugSubmissionForm challenge={challenge} submission={submission} />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
