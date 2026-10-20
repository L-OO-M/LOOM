import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, PlainStat, Rule } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import {
  STANDINGS_BOARD_SIZE,
  canLinkProfile,
  fetchBoard,
  fetchSelfEvidenceSummary,
  fetchSelfStanding,
  isStaffExcluded,
  isVerifiedRankingEnabled,
  normalizePeriod,
  normalizeScope,
  standingBreakdown,
} from "@/lib/standings";
import StandingsBoard from "./_components/StandingsBoard";

export const dynamic = "force-dynamic";

const SCOPES = [
  { id: "college", label: "College", board: "your college", pop: "students in your chapter" },
  { id: "global", label: "Everywhere", board: "every chapter", pop: "students everywhere" },
  {
    id: "friends",
    label: "Circle",
    board: "your circle",
    pop: "builders in your circle",
    hint: "Circle shows you and GitHub-linked builders in this board — not a friends list.",
  },
];

const PERIODS = [
  { id: "all", label: "All time" },
  { id: "30d", label: "30 days" },
];

function hrefFor(scope, period) {
  const params = new URLSearchParams();
  if (scope !== "college") params.set("scope", scope);
  if (period !== "all") params.set("period", period);
  const qs = params.toString();
  return `/student/leaderboard${qs ? `?${qs}` : ""}`;
}

export default async function StandingsPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/leaderboard");
  const { user, profile, tenant, sql } = ctx;
  const sp = await searchParams;
  const scope = normalizeScope(sp?.scope);
  const period = normalizePeriod(sp?.period);
  const tid = tenant?.id ?? null;
  const active = SCOPES.find((s) => s.id === scope);

  // Sequential by pooler convention: one live aggregate at a time.
  const verifiedOnly = await isVerifiedRankingEnabled(sql, tid);
  const board = await fetchBoard(sql, {
    viewerId: user.id,
    tenantId: tid,
    scope,
    period,
    limit: STANDINGS_BOARD_SIZE,
    offset: 0,
    verifiedOnly,
  });
  const self = await fetchSelfStanding(sql, { viewerId: user.id, tenantId: tid, scope, period, verifiedOnly });
  const selfEvidence = await fetchSelfEvidenceSummary(sql, { userId: user.id, tenantId: tid });
  const staff = isStaffExcluded(profile?.role);

  const rows = board.map((r) => ({
    user_id: r.user_id,
    rank: Number(r.rank),
    name: r.name,
    primary_domain: r.primary_domain,
    commits: Number(r.commits),
    prs: Number(r.prs),
    verified_score: Number(r.verified_score),
    pending: Number(r.pending),
    score: Number(r.score),
    is_self: r.user_id === user.id,
    profile_href: canLinkProfile(r, tid, user.id) ? `/student/${r.username}` : null,
  }));

  const empty = rows.length === 0 && !self.ranked;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Prove · steady work, ranked</Meta>
        <Display size="lg" className="mt-3 animate-in">Where steady work shows.</Display>
        <p className="narrative mt-4 max-w-xl">
          Standings reflect the work you keep shipping, learning, and contributing.
        </p>
        <Rule fade className="mt-6" />

        {self.ranked ? (
          <section aria-label="Your standing" className="animate-in mt-8 rounded-xl border px-5 py-5 sm:px-6" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--accent) 6%, var(--bg-elevated))", borderLeft: "3px solid var(--accent)" }}>
            <Meta style={{ color: "var(--accent)" }}>Your standing</Meta>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="font-display" style={{ fontSize: "clamp(3rem, 9vw, 4.5rem)", lineHeight: 1, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  #{self.rank}
                </p>
                <p className="meta mt-2">of {self.total} {active.pop}</p>
              </div>
              <div className="text-right">
                <p className="figure-mono font-semibold" style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)", lineHeight: 1.1, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  {Number(self.score).toLocaleString("en-IN")}
                </p>
                <p className="meta mt-1">points</p>
              </div>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-6 border-t pt-6 sm:grid-cols-4" style={{ borderColor: "var(--line)" }}>
              <PlainStat value={self.verified_score} unit="pts" label="from verified evidence" />
              <PlainStat value={self.commits} unit="commits" label={period === "30d" ? "commits in the last 30 days" : "commits recorded"} />
              <PlainStat value={self.prs} unit="PRs" label={period === "30d" ? "pull requests in the last 30 days" : "pull requests opened"} />
              <PlainStat value={self.pending} unit="pending" label="claims awaiting review" />
            </div>
            {Number(self.pending) > 0 && (
              <p className="meta mt-4">
                Pending claims score nothing until a lead confirms them. They are not a
                penalty — they are simply not evidence yet.
              </p>
            )}
          </section>
        ) : (
          <section aria-label="Your standing" className="mt-8 rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <Meta style={{ color: "var(--accent)" }}>Your standing</Meta>
            {staff ? (
              <>
                <p className="h-product mt-3">Staff accounts are not ranked.</p>
                <p className="narrative mt-3 max-w-xl">
                  Chapter service accounts are left off the board on purpose — an admin
                  account that also appears in the ranking makes it hard to read, and easy
                  to mistake for a student&apos;s. Your verified work still counts for
                  credentials and chapter totals.
                </p>
              </>
            ) : (
              <>
                <p className="h-product mt-3">
                  {Number(self.pending) > 0
                    ? "Your work is waiting on confirmation."
                    : "Your standing isn’t visible yet."}
                </p>
                <p className="narrative mt-3 max-w-xl">
                  The board only counts work somebody else can confirm. Here is everything
                  you have done, and what each part is waiting on.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                  <PlainStat value={selfEvidence.verifiedNodes} unit="nodes" label="verified by a lead" />
                  <PlainStat value={Number(self.pending)} unit="claims" label="awaiting review" />
                  <PlainStat value={selfEvidence.provisionalNodes} unit="nodes" label="complete but provisional" />
                  <PlainStat value={Number(self.commits)} unit="commits" label={period === "30d" ? "attested, last 30 days" : "attested by GitHub"} />
                  <PlainStat value={Number(self.prs)} unit="PRs" label={period === "30d" ? "attested, last 30 days" : "attested by GitHub"} />
                  <PlainStat value={selfEvidence.resourceLessons} unit="lessons" label="done — learning, not scored" />
                </div>
                <ul className="mt-6 space-y-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  {selfEvidence.provisionalNodes > 0 && (
                    <li>
                      {selfEvidence.provisionalNodes} roadmap {selfEvidence.provisionalNodes === 1 ? "node is" : "nodes are"} complete but
                      not yet confirmed. A chapter lead has to review the evidence before
                      {" "}<Link href="/student/roadmap" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>the node</Link>
                      {" "}scores.
                    </li>
                  )}
                  {Number(self.pending) > 0 && (
                    <li>
                      {Number(self.pending)} claim{Number(self.pending) === 1 ? "" : "s"} awaiting review
                      score nothing until a lead confirms them.
                    </li>
                  )}
                  {Number(self.commits) === 0 && Number(self.prs) === 0 && (
                    <li>
                      No attested GitHub activity yet. Commits and pull requests only count
                      when they come from the account you linked —
                      {" "}<Link href="/student/github" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>connect GitHub</Link>.
                    </li>
                  )}
                  {selfEvidence.resourceLessons > 0 && (
                    <li>
                      Lessons you mark done track your learning. They are visible here but
                      deliberately worth no ranking points.
                    </li>
                  )}
                  {selfEvidence.activeDays30 > 0 && (
                    <li>
                      You were active on {selfEvidence.activeDays30} of the last 30 days.
                      Consistency is shown on your GitHub page; the board scores verified
                      outcomes, not attendance.
                    </li>
                  )}
                  {selfEvidence.verifiedNodes === 0 && Number(self.pending) === 0 && Number(self.commits) === 0 && Number(self.prs) === 0 && (
                    <li>Nothing has been verified for your account yet. Start with a roadmap node or link GitHub.</li>
                  )}
                </ul>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/student/roadmap" prefetch={false} className="btn-ink">Continue the roadmap</Link>
                  <Link href="/student/github" prefetch={false} className="btn-ghost">Connect GitHub</Link>
                </div>
              </>
            )}
          </section>
        )}

        <details className="mt-8 border-y" style={{ borderColor: "var(--line)" }}>
          <summary className="cursor-pointer list-none py-4 text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            How the score works
          </summary>
          <div className="max-w-2xl pb-6 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            <p className="font-semibold" style={{ color: "var(--text)" }}>
              Only work somebody else can confirm counts.
            </p>
            <p className="mt-2">
              Every point comes from one of two places: a signed GitHub delivery, or a
              chapter lead reviewing what you submitted. A claim you make about yourself
              is not evidence — it waits, scores nothing, and either a lead confirms it or
              it does not count. The database refuses to record a score that nobody
              vouched for, so there is no way to skip this.
            </p>
            <ul className="mt-4 space-y-2">
              {standingBreakdown().map((b) => (
                <li key={b.label} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span style={{ color: "var(--text)" }}>{b.label}</span>
                    <span className="meta"> — {b.source}</span>
                  </span>
                  <span className="figure-mono shrink-0" style={{ color: "var(--accent)" }}>
                    +{b.weight}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              Each kind pays full value up to a cap and a tenth of that afterwards, so
              repeating the same easy thing cannot climb the board. Older evidence fades
              gradually rather than disappearing.
            </p>
            <p className="mt-2">
              Standings reflect verified contribution, not developer ability. Equal scores
              share a rank. Chapter service accounts stay off the board.
            </p>
            {period === "30d" && (
              <p className="mt-2">
                In the 30-day view, commits and pull requests cover the last 30 days.
                Verified evidence is lifetime.
              </p>
            )}
            <p className="mt-2">
              If a lead declines a claim, the points are withdrawn. A board that cannot be
              corrected is not worth reading.
            </p>
          </div>
        </details>

        {empty ? (
          verifiedOnly ? (
            <OnboardingState
              eyebrow="Standings"
              title="Nobody is standing here yet."
              why="Standings only count work that a chapter lead or GitHub has confirmed. Once verified contributions arrive, they will appear here."
              action={<Link href="/student/github" prefetch={false} className="btn-ink">Start with GitHub →</Link>}
            />
          ) : (
            <OnboardingState
              eyebrow="Standings"
              title="Verified standings are not switched on yet."
              why="Your chapter is still showing the older self-reported board, which counted nodes and projects without anyone confirming them. An admin can switch on verified standings from Feature flags."
              action={<Link href="/student/github" prefetch={false} className="btn-ghost">Connect GitHub</Link>}
            />
          )
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border p-2" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div className="seg !border-0 !bg-transparent !p-0 flex flex-wrap" role="group" aria-label="Ranking scope">
                {SCOPES.map((s) => (
                  <Link
                    key={s.id}
                    href={hrefFor(s.id, period)}
                    prefetch={false}
                    aria-pressed={scope === s.id ? "true" : "false"}
                    title={s.hint}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={scope === s.id ? { background: "var(--text)", color: "var(--bg)" } : { color: "var(--text-muted)", border: "1px solid var(--line)" }}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
              <span className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} aria-hidden="true" />
              <div className="seg !border-0 !bg-transparent !p-0 flex flex-wrap" role="group" aria-label="Time period">
                {PERIODS.map((p) => (
                  <Link
                    key={p.id}
                    href={hrefFor(scope, p.id)}
                    prefetch={false}
                    aria-pressed={period === p.id ? "true" : "false"}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={period === p.id ? { background: "var(--text)", color: "var(--bg)" } : { color: "var(--text-muted)", border: "1px solid var(--line)" }}
                  >
                    {p.label}
                  </Link>
                ))}
              </div>
            </div>
            {scope === "friends" && (
              <p className="meta mt-3">Circle shows you and GitHub-linked builders in this board — not a friends list.</p>
            )}

            <section aria-label="The standings board" className="mt-2">
              <StandingsBoard rows={rows} scopeLabel={active.board} />
            </section>

            <section aria-label="What moves the needle" className="mt-12">
              <Meta>What moves the needle</Meta>
              <p className="narrative mt-3 max-w-xl">
                {verifiedOnly
                  ? "Only verified evidence scores: GitHub-attested commits and pull requests, lead-confirmed roadmap nodes, and reviewed open-source merges. Projects and challenges show your work, but they score only when your chapter records proof."
                  : "This chapter still uses the older self-reported board: completed nodes and published projects score without a second confirmation. An admin can switch on verified standings from Feature flags."}
              </p>
              <ol className="mt-4">
                {[
                  { href: "/student/roadmap", title: "Finish a roadmap node", body: verifiedOnly ? "Scores after a chapter lead confirms the evidence." : "Completed nodes carry the most weight per item." },
                  { href: "/student/projects", title: "Ship a project", body: verifiedOnly ? "Builds your profile; it does not score on its own." : "Published work counts toward your score." },
                  { href: "/student/opensource", title: "Contribute to open source", body: "Merged pull requests score automatically and become proof." },
                  { href: "/student/contests", title: "Take on a challenge", body: verifiedOnly ? "Placements score when your chapter records the result." : "Deadlines turn practice into proof." },
                ].map((a) => (
                  <li key={a.href} className="border-b py-4 first:border-t" style={{ borderColor: "var(--line)" }}>
                    <Link href={a.href} prefetch={false} className="row-link flex items-center gap-4 px-2 py-1">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.98rem] font-semibold" style={{ color: "var(--text)" }}>{a.title}</span>
                        <span className="meta mt-0.5 block">{a.body}</span>
                      </span>
                      <span className="shrink-0 text-lg" style={{ color: "var(--text-muted)" }} aria-hidden="true">›</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>

            <nav aria-label="The Prove journey" className="mt-12 border-t pt-6" style={{ borderColor: "var(--line)" }}>
              <Meta>The Prove journey</Meta>
              <ul className="mt-3 space-y-2.5 text-sm">
                <li style={{ color: "var(--text-muted)" }}>
                  <Link href="/student/credentials" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>Proof</Link>
                  {" "}— credentials show what you&apos;ve earned.
                </li>
                <li style={{ color: "var(--text-muted)" }}>
                  <Link href="/student/contests" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>Challenges</Link>
                  {" "}— challenges show what you&apos;ve shipped under pressure.
                </li>
                <li style={{ color: "var(--text-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--text)" }}>Standings</span>
                  {" "}— you are here. Visible contribution, compared calmly.
                </li>
              </ul>
            </nav>
          </>
        )}
      </main>
    </AppShell>
  );
}
