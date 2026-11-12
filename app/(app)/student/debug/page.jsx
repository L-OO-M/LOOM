import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/loom/primitives";
import { WorkspaceEmpty, WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { BuildTabs } from "@/components/student/SectionRails";
import { loadDebugCatalogue, loadMyDebugSubmissions } from "@/lib/debug";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

const STATUS_LABEL = {
  verified: "fork verified",
  error: "check pending",
  rejected: "fork rejected"
};

export default async function StudentDebugPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/debug");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student/onboarding");

  const challenges = await loadDebugCatalogue(sql, tenant.id, { publishedOnly: true });
  const submissions = await loadMyDebugSubmissions(sql, tenant.id, user.id);
  const byChallenge = new Map(submissions.map((submission) => [submission.challengeId, submission]));
  const approved = submissions.filter((submission) => submission.reviewStatus === "approved").length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Build / debug room / ${challenges.length} open`}
          title="Find it. Fix it. Prove it."
          lede="Each challenge is a real bug in a public starter repository. Fork it, fix the failing behaviour, and submit your fork for a domain lead to review."
          meta={`${approved} approved / ${submissions.length} submitted / fork verification runs before review`}
          stats={[
            { value: challenges.length, label: "published challenges" },
            { value: submissions.length, label: "your submissions" },
            { value: approved, label: "approved fixes" },
            { value: challenges.length - byChallenge.size, label: "not attempted" }
          ]}
        />

        <BuildTabs active="/student/debug" />

        <WorkspaceSection
          index="01"
          title="Open challenges"
          note="A submission is a fork you own with at least one commit from your linked GitHub account."
        >
          {challenges.length === 0 ? (
            <WorkspaceEmpty
              title="No debug challenges are published yet."
              body="Admin publishes the first challenge from the debug workspace. Nothing is invented here for you."
            />
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {challenges.map((challenge) => {
                const submission = byChallenge.get(challenge.id);
                return (
                  <li key={challenge.id}>
                    <Link
                      href={`/student/debug/${challenge.slug}`}
                      prefetch={false}
                      className="block h-full rounded-2xl border p-5 transition hover:shadow-sm"
                      style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill>{challenge.domain}</StatusPill>
                        <StatusPill>{challenge.difficulty}</StatusPill>
                        {submission ? <StatusPill>{STATUS_LABEL[submission.verificationStatus] || submission.reviewStatus}</StatusPill> : null}
                      </div>
                      <p className="mt-3 text-base font-semibold" style={{ color: "var(--text)" }}>{challenge.title}</p>
                      <p className="narrative mt-2 line-clamp-3 text-sm leading-6">{challenge.brief || "Open the brief to see the failing behaviour and verification steps."}</p>
                      <p className="meta mt-4">{submission ? `Submitted ${submission.reviewStatus}` : "Not attempted"} / {challenge.repoPath}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="02" title="How review works" note="The fork check is mechanical. A human decides whether the fix is correct.">
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Fork", "Fork the challenge repository after it was published. Do not submit a fresh repo."],
              ["Fix", "Commit from the GitHub account linked to LOOM. Open a pull request if the brief asks for one."],
              ["Review", "Your domain lead sees the verified fork. Approval records debug evidence in chapter standing."]
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</p>
                <p className="narrative mt-1 text-xs leading-5">{body}</p>
              </div>
            ))}
          </div>
          <p className="meta mt-4">
            GitHub not linked? <Link href="/student/github" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Connect it first</Link>.
          </p>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
