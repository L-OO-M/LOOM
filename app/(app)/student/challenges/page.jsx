import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/loom/primitives";
import { WorkspaceEmpty, WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { LearnTabs } from "@/components/student/SectionRails";
import { DOMAIN_ORDER, domainLabel } from "@/lib/domains";
import { loadChallenges } from "@/lib/challenges";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

/**
 * The Learn surface's challenge hub.
 *
 * The old Practice tab was DSA and nothing else. This page keeps that weekly
 * LeetCode habit (it is genuinely useful) but puts it beside the challenges that
 * match the member's own track, so the roadmap can say "learned enough? try
 * this" and land somewhere real.
 */
export default async function StudentChallengesPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/challenges");
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/student/onboarding");

  const sp = (await searchParams) || {};
  const requested = typeof sp.domain === "string" ? sp.domain : null;
  const domain = requested && DOMAIN_ORDER.includes(requested) ? requested : (profile?.primary_domain || "dsa");

  const overview = await loadChallenges(sql, { userId: user.id, tenantId: tenant.id, domain });
  const practice = overview.practice;
  const domainChallenges = overview.debug.items;
  const contests = overview.contests.items;
  const openWork = domainChallenges.length + contests.length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Learn / challenges / ${domainLabel(domain)}`}
          title="Practice that matches your track."
          lede="The weekly LeetCode set keeps the core sharp. Debug tasks and chapter contests are where your own domain turns into proof."
          meta={practice
            ? `${practice.title} / ${practice.solved} of ${practice.total || 7} recorded`
            : "No weekly set is open right now"}
          stats={[
            { value: practice?.total || 0, label: "weekly core questions" },
            { value: practice?.solved || 0, label: "recorded this week" },
            { value: domainChallenges.length, label: `${domainLabel(domain)} debug tasks` },
            { value: contests.length, label: "open contests" }
          ]}
        />

        <LearnTabs active="/student/challenges" />

        <WorkspaceSection
          index="01"
          title={`${domainLabel(domain)} challenges`}
          note="Real starter repositories and chapter contests. Only what the chapter has actually published appears here."
        >
          {openWork === 0 ? (
            <WorkspaceEmpty
              title={`No ${domainLabel(domain)} challenge is published yet.`}
              body="The weekly core set is still open, and your lead can publish a debug task or contest for this track. Nothing is invented to fill the space."
            />
          ) : (
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
                      <StatusPill>{domainLabel(challenge.domain)}</StatusPill>
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
          )}
          <div className="mt-4 flex flex-wrap gap-2">
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
        </WorkspaceSection>

        <WorkspaceSection
          index="02"
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
