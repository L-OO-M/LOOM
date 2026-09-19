import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, PlainStat, Rule } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import {
  STANDINGS_BOARD_SIZE,
  STANDINGS_WEIGHTS,
  canLinkProfile,
  fetchBoard,
  fetchSelfStanding,
  normalizePeriod,
  normalizeScope,
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
  const { user, tenant, sql } = ctx;
  const sp = await searchParams;
  const scope = normalizeScope(sp?.scope);
  const period = normalizePeriod(sp?.period);
  const tid = tenant?.id ?? null;
  const active = SCOPES.find((s) => s.id === scope);

  // Sequential by pooler convention: one live aggregate at a time.
  const board = await fetchBoard(sql, {
    viewerId: user.id,
    tenantId: tid,
    scope,
    period,
    limit: STANDINGS_BOARD_SIZE,
    offset: 0,
  });
  const self = await fetchSelfStanding(sql, { viewerId: user.id, tenantId: tid, scope, period });

  const rows = board.map((r) => ({
    user_id: r.user_id,
    rank: Number(r.rank),
    name: r.name,
    primary_domain: r.primary_domain,
    commits: Number(r.commits),
    prs: Number(r.prs),
    nodes_done: Number(r.nodes_done),
    projects: Number(r.projects),
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
          <section aria-label="Your standing" className="animate-in mt-8 rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", borderLeft: "2px solid var(--accent)" }}>
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
              <PlainStat value={self.nodes_done} unit="nodes" label="roadmap nodes completed" />
              <PlainStat value={self.commits} unit="commits" label={period === "30d" ? "commits in the last 30 days" : "commits recorded"} />
              <PlainStat value={self.prs} unit="PRs" label={period === "30d" ? "pull requests in the last 30 days" : "pull requests opened"} />
              <PlainStat value={self.projects} unit="projects" label="projects shipped" />
            </div>
          </section>
        ) : (
          !empty && (
            <section aria-label="Your standing" className="mt-8 rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <Meta style={{ color: "var(--accent)" }}>Your standing</Meta>
              <p className="h-product mt-3">Your standing isn&apos;t visible yet.</p>
              <p className="narrative mt-3 max-w-xl">
                {scope === "friends"
                  ? "Circle shows you and GitHub-linked builders in this board. Link your GitHub identity and your work will appear here."
                  : "Complete a roadmap node, ship a project, or push linked commits and your name will appear on this board."}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/student/roadmap" prefetch={false} className="btn-ink">Continue the roadmap</Link>
                <Link href="/student/github" prefetch={false} className="btn-ghost">Connect GitHub</Link>
              </div>
            </section>
          )
        )}

        <details className="mt-8 border-y" style={{ borderColor: "var(--line)" }}>
          <summary className="cursor-pointer list-none py-4 text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            How the score works
          </summary>
          <div className="max-w-2xl pb-6 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            <ul className="space-y-1.5">
              <li>Commits × {STANDINGS_WEIGHTS.commit}</li>
              <li>Pull requests × {STANDINGS_WEIGHTS.pullRequest}</li>
              <li>Completed roadmap nodes × {STANDINGS_WEIGHTS.roadmapNode}</li>
              <li>Projects × {STANDINGS_WEIGHTS.project} <span className="meta">(every status except archived)</span></li>
            </ul>
            <p className="mt-4">
              Standings use activity counts to provide a simple view of visible progress — not a measure of developer ability.
              Equal scores share a rank. Chapter service accounts stay off the board.
            </p>
            {period === "30d" && (
              <p className="mt-2">
                In the 30-day view, commits and pull requests cover the last 30 days. Roadmap nodes and projects are lifetime totals.
              </p>
            )}
          </div>
        </details>

        {empty ? (
          <OnboardingState
            eyebrow="Standings"
            title="Nobody is standing here yet."
            why="Once builders start contributing, their progress will appear here."
            action={<Link href="/student/github" prefetch={false} className="btn-ink">Start with GitHub →</Link>}
          />
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="seg" role="group" aria-label="Ranking scope">
                {SCOPES.map((s) => (
                  <Link
                    key={s.id}
                    href={hrefFor(s.id, period)}
                    prefetch={false}
                    aria-pressed={scope === s.id ? "true" : "false"}
                    title={s.hint}
                    className={scope === s.id ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"}
                    style={scope === s.id ? undefined : { color: "var(--text-muted)" }}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
              <div className="seg" role="group" aria-label="Time period">
                {PERIODS.map((p) => (
                  <Link
                    key={p.id}
                    href={hrefFor(scope, p.id)}
                    prefetch={false}
                    aria-pressed={period === p.id ? "true" : "false"}
                    className={period === p.id ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"}
                    style={period === p.id ? undefined : { color: "var(--text-muted)" }}
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
                Standings are a reflection of visible contribution. Keep building across LOOM.
              </p>
              <ol className="mt-4">
                {[
                  { href: "/student/roadmap", title: "Finish a roadmap node", body: "Completed nodes carry the most weight per item." },
                  { href: "/student/projects", title: "Ship a project", body: "Published work counts toward your score." },
                  { href: "/student/opensource", title: "Contribute to open source", body: "Pull requests move your score and your proof." },
                  { href: "/student/contests", title: "Take on a challenge", body: "Deadlines turn practice into proof." },
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
