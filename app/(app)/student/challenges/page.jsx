import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/loom/primitives";
import { WorkspaceEmpty, WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { DOMAIN_ORDER, domainLabel, normalizeDomainKey } from "@/lib/domains";
import { loadChallenges } from "@/lib/challenges";
import {
  challengeRepoChoices,
  loadMyOssSubmissions
} from "@/lib/oss-challenges";
import { SOCIETY_RULES, societyChallenge } from "@/lib/society";
import { WEIGHTS, KIND_CAPS } from "@/lib/ranking";
import { SocietyChallengeForm } from "./_components/SocietyChallengeForm";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

/**
 * The challenge hub for one domain.
 *
 * It is not a tab any more: the roadmap's challenge panel opens it with the
 * track the member was reading, so this page never has to guess. Its job is to
 * put real, attemptable work first — the society fork challenge, then curated
 * repositories — and to state the rules the review actually applies.
 */
export default async function StudentChallengesPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/challenges");
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student/onboarding");

  const sp = (await searchParams) || {};
  const requested = typeof sp.domain === "string" ? normalizeDomainKey(sp.domain) : null;
  const domain = requested && DOMAIN_ORDER.includes(requested)
    ? requested
    : (normalizeDomainKey(profile?.primary_domain) || "dsa");

  const overview = await loadChallenges(sql, { userId: user.id, tenantId: tenant.id, domain });
  const practice = overview.practice;
  const domainChallenges = overview.debug.items;
  const contests = overview.contests.items;
  const repos = overview.opensource.items;
  const openWork = domainChallenges.length + contests.length;

  const society = societyChallenge(domain);
  const submissions = await loadMyOssSubmissions(sql, tenant.id, user.id, { domain });
  const choices = await challengeRepoChoices(sql, tenant.id, domain);
  const approved = submissions.filter((item) => item.status === "approved").length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Learn / roadmap / ${domainLabel(domain)}`}
          title="Challenges for this track."
          lede="Fork something real, fix it, submit the fork. A domain lead grades the work and the approval lands on your chapter standing."
          meta={practice
            ? `${practice.title} (${practice.track}) / ${practice.solved} of ${practice.total || 7} recorded`
            : "No weekly set is open right now"}
          stats={[
            { value: approved, label: "society fixes approved" },
            { value: submissions.length, label: "your submissions" },
            { value: repos.length, label: "curated repos" },
            { value: practice?.solved || 0, label: "weekly set recorded" }
          ]}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/student/roadmap?domain=${encodeURIComponent(domain)}`}
            prefetch={false}
            className="text-xs font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            &larr; Back to the {domainLabel(domain)} roadmap
          </Link>
          <div className="ml-auto flex flex-wrap gap-2">
            {DOMAIN_ORDER.filter((d) => d !== domain).map((d) => (
              <Link
                key={d}
                href={`/student/challenges?domain=${d}`}
                prefetch={false}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
              >
                {domainLabel(d)}
              </Link>
            ))}
          </div>
        </div>

        <WorkspaceSection
          index="01"
          title="Society open-source challenge"
          note="The chapter's own broken repository. Fork it, fix one bug, submit the fork."
          action={<StatusPill>{society.folder || society.repo}</StatusPill>}
        >
          <div id="society" className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
            >
              <p className="meta">Start here</p>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--text)" }}>
                {society.hasFolder ? (
                  <>
                    Your domain lives in <code>{society.folder}</code> inside{" "}
                    <code>{society.repo}</code>. Open the folder, read the project README, and
                    reproduce the bug before changing anything.
                  </>
                ) : (
                  <>
                    <code>{society.repo}</code> has no folder for this shared track yet. Pick the
                    closest project, or start from the repository README.
                  </>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
                <a
                  href={society.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost !py-2"
                >
                  Open {society.hasFolder ? "your domain folder" : "the repository"} &nearr;
                </a>
                <a
                  href={society.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-1 py-2 hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Fork on GitHub &nearr;
                </a>
              </div>
              <p className="meta mt-4">
                Approval is worth {WEIGHTS.oss_challenge} points, capped at {KIND_CAPS.oss_challenge}
                {" "}reviewed fixes on the standing board.
              </p>
            </div>

            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="meta">The rules</p>
              <ol className="mt-2 space-y-2.5">
                {SOCIETY_RULES.map((rule, index) => (
                  <li key={rule.title} className="text-xs leading-5">
                    <span className="font-mono" style={{ color: "var(--accent)" }}>
                      {String(index + 1).padStart(2, "0")}
                    </span>{" "}
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{rule.title}.</span>{" "}
                    <span style={{ color: "var(--text-muted)" }}>{rule.body}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <SocietyChallengeForm
            domain={domain}
            choices={choices}
            submissions={submissions}
            repo={society.repo}
          />
        </WorkspaceSection>

        <WorkspaceSection
          index="02"
          title={`${domainLabel(domain)} repositories`}
          note="Curated projects with starter issues. A merged pull request is verified by webhook; a fork without a merge can still be graded here."
        >
          {repos.length === 0 ? (
            <WorkspaceEmpty
              title={`No ${domainLabel(domain)} repository is curated yet.`}
              body="The society challenge above works for every track. An admin can add repositories to this domain at any time."
            />
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {repos.map((repo) => (
                <li key={repo.id}>
                  <div
                    className="flex h-full flex-col rounded-2xl border p-5"
                    style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill>{repo.language || domainLabel(domain)}</StatusPill>
                      {repo.issues > 0 ? <StatusPill>{repo.issues} starter issues</StatusPill> : null}
                    </div>
                    <p className="mt-3 text-base font-semibold" style={{ color: "var(--text)" }}>{repo.title}</p>
                    <p className="narrative mt-2 line-clamp-2 text-sm leading-6">
                      {repo.detail || "Open the repository to read the contributing guide."}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 pt-4 text-xs font-semibold">
                      <a
                        href={repo.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        Open repository &nearr;
                      </a>
                      <Link
                        href={repo.href}
                        prefetch={false}
                        className="hover:underline"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Claim a pull request
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        {openWork > 0 ? (
          <WorkspaceSection
            index="03"
            title={`${domainLabel(domain)} chapter tasks`}
            note="Only what your chapter has actually published appears here."
          >
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {domainChallenges.map((challenge) => (
                <li key={`debug-${challenge.id}`}>
                  <Link
                    href={challenge.href}
                    prefetch={false}
                    className="block h-full rounded-2xl border p-5 transition hover:shadow-sm"
                    style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill>Debug</StatusPill>
                      <StatusPill>{challenge.difficulty}</StatusPill>
                    </div>
                    <p className="mt-3 text-base font-semibold" style={{ color: "var(--text)" }}>{challenge.title}</p>
                    <p className="meta mt-4">Fork, fix, and submit for review.</p>
                  </Link>
                </li>
              ))}
              {contests.map((contest) => (
                <li key={`contest-${contest.id}`}>
                  <Link
                    href={contest.href}
                    prefetch={false}
                    className="block h-full rounded-2xl border p-5 transition hover:shadow-sm"
                    style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill>Contest</StatusPill>
                      <StatusPill>{contest.domain === "general" ? "Whole chapter" : domainLabel(contest.domain)}</StatusPill>
                      {contest.registered ? <StatusPill>Registered</StatusPill> : null}
                    </div>
                    <p className="mt-3 text-base font-semibold" style={{ color: "var(--text)" }}>{contest.title}</p>
                    <p className="meta mt-4">{contest.status === "open" ? "Open now" : "Opens soon"} / deadline in the brief</p>
                  </Link>
                </li>
              ))}
            </ul>
          </WorkspaceSection>
        ) : null}

        <WorkspaceSection
          index={openWork > 0 ? "04" : "03"}
          title="Weekly core set"
          note="DSA stays a shared habit. Solve on LeetCode inside the week and the accepted submission counts once."
        >
          {practice ? (
            <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold" style={{ color: "var(--text)" }}>{practice.title}</p>
                  <p className="meta mt-1">{practice.solved} of {practice.total || 7} recorded this week</p>
                </div>
                <Link href={practice.href} prefetch={false} className="btn-ink !py-2 text-sm">
                  Open practice room &rarr;
                </Link>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.round((practice.solved / Math.max(1, practice.total || 7)) * 100))}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
          ) : (
            <WorkspaceEmpty
              title="No weekly set is open."
              body="When a lead schedules the next seven, the room opens here with your real solved count. You can still browse past weeks."
            />
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
