"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Display, Meta, ActionLink, PlainStat } from "@/components/loom/primitives";
import { ProgressPath } from "@/components/loom/ProgressPath";
import { WeekStrip } from "@/components/loom/Heatmap";
import { ActivityStream } from "@/components/loom/Evidence";
import { OnboardingState } from "@/components/loom/States";

function relDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function StudentDashboard({
  profile, greeting, todayLabel, nextNode, nodes, doneIds, overallPercent,
  nextMilestone, weekDays, weekCounts, contests, events, sessions, proof, snapshot, peers
}) {
  const name = profile?.name?.split(" ")[0] || "there";
  const done = new Set(doneIds);
  const stops = nodes.map((n) => ({
    label: n.title,
    state: done.has(n.id) ? "done" : nextNode && n.id === nextNode.id ? "now" : "todo"
  }));
  const fresh = !profile?.primary_domain || doneIds.length === 0;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* HERO — what should I do next? */}
      <Reveal>
        <section className="hero-field rounded-3xl border px-6 py-10 sm:px-10 sm:py-14" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <Meta>{todayLabel}</Meta>
          <Display size="xl" className="mt-3">
            {greeting}, {name}.
          </Display>
          {nextNode ? (
            <div className="mt-8 max-w-xl">
              <Meta style={{ color: "var(--accent)" }}>Your next move</Meta>
              <p className="display display-md mt-2">{nextNode.title}</p>
              <p className="meta mt-3">
                {nextNode.domain}{nextNode.difficulty_level ? ` · ${nextNode.difficulty_level}` : ""} · Milestone {doneIds.length + 1} of {nodes.length}
              </p>
              {nextNode.description && (
                <p className="narrative mt-3">{nextNode.description}</p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link href="/student/roadmap" className="btn-ink !px-6 !py-3 !text-base">Continue →</Link>
                <ActionLink href={`/student/roadmap/${nextNode.id}`}>Node detail</ActionLink>
              </div>
            </div>
          ) : (
            <div className="mt-8 max-w-xl">
              <Meta style={{ color: "var(--accent)" }}>A quiet milestone</Meta>
              <p className="display display-md mt-2">The whole path, walked.</p>
              <p className="narrative mt-3">Every node complete. Turn this momentum into public proof — or mentor someone two steps behind you.</p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link href="/student/credentials" className="btn-ink !px-6 !py-3 !text-base">Share proof →</Link>
                <ActionLink href="/student/opensource">Find an OSS issue</ActionLink>
              </div>
            </div>
          )}
        </section>
      </Reveal>

      {fresh ? (
        <Reveal delay={0.08}>
          <section className="mt-10" aria-label="Begin">
            <OnboardingState
              eyebrow="Your first week"
              title="Three small steps unlock everything."
              why="L.O.O.M. reads your real activity — roadmap progress, commits, shipped projects — and turns it into proof. Nothing here is manual theatre."
              steps={[
                { title: "Set your direction", body: "Pick a track in onboarding so recommendations know where to point." },
                { title: "Finish your first node", body: "Open the roadmap and complete milestone one. The next unlocks itself." },
                { title: "Connect GitHub", body: "Real commits become growth evidence, automatically." }
              ]}
              action={<Link href="/student/roadmap" className="btn-ink">Open your roadmap →</Link>}
            />
          </section>
        </Reveal>
      ) : (
        <>
          {/* WEEK */}
          <Reveal delay={0.05}>
            <section className="mt-12" aria-label="This week">
              <Meta>This week</Meta>
              <div className="mt-4 max-w-xl">
                <WeekStrip days={weekDays} />
              </div>
              <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
                <strong className="font-mono font-semibold" style={{ color: "var(--text)" }}>{weekCounts.sessions}</strong> learning sessions ·{" "}
                <strong className="font-mono font-semibold" style={{ color: "var(--text)" }}>{weekCounts.contributions}</strong> contributions ·{" "}
                <strong className="font-mono font-semibold" style={{ color: "var(--text)" }}>{weekCounts.milestones}</strong> milestone{weekCounts.milestones === 1 ? "" : "s"}
              </p>
            </section>
          </Reveal>

          {/* JOURNEY */}
          <Reveal delay={0.08}>
            <section className="mt-12" aria-label="Your journey">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Meta>Your journey</Meta>
                <span className="meta">{doneIds.length} / {nodes.length} milestones</span>
              </div>
              <div className="mt-5">
                <ProgressPath stops={stops} percent={overallPercent} ariaLabel={`${overallPercent} percent of roadmap complete`} />
              </div>
              {nextMilestone && (
                <div className="mt-8 flex flex-wrap items-baseline justify-between gap-3">
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Next milestone — <strong style={{ color: "var(--text)" }}>{nextMilestone}</strong>
                  </p>
                  <ActionLink href="/student/roadmap">Open the path</ActionLink>
                </div>
              )}
            </section>
          </Reveal>

          {/* COMING UP + PROOF */}
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <Reveal delay={0.05}>
              <section aria-label="Coming up">
                <Meta>Coming up</Meta>
                <ComingUp contests={contests} events={events} sessions={sessions} />
              </section>
            </Reveal>
            <Reveal delay={0.08}>
              <section aria-label="Recent proof">
                <div className="flex items-baseline justify-between">
                  <Meta>Recent proof</Meta>
                  <ActionLink href="/student/credentials">All proof</ActionLink>
                </div>
                <div className="mt-2">
                  {proof.length > 0 ? (
                    <ActivityStream items={proof} />
                  ) : (
                    <p className="narrative mt-3">Nothing recorded yet. Finish a node or ship a project — it will appear here, with evidence attached.</p>
                  )}
                </div>
              </section>
            </Reveal>
          </div>

          {/* GROWTH STORY — insights folded in, never a dead end */}
          <Reveal delay={0.05}>
            <section className="mt-12 border-t pt-10" style={{ borderColor: "var(--line)" }} aria-label="Your growth">
              {snapshot ? (
                <>
                  <Meta>Your last 30 days</Meta>
                  <div className="mt-6 grid gap-8 sm:grid-cols-3">
                    <PlainStat value={`${Number(snapshot.consistency_score || 0)}`} unit="%" label="days active out of the last 30" />
                    <PlainStat value={`${Number(snapshot.roadmap_completion_pct || 0)}`} unit="%" label="roadmap complete and climbing" />
                    <PlainStat value={`${snapshot.total_commits ?? 0}`} unit="commits" label="in the last 30 days" />
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {peers?.n > 0
                        ? `Chapter average consistency is ${Number(peers.ac || 0)}% across ${peers.n} peers.`
                        : "Peer comparison appears once the chapter has snapshots."}
                    </p>
                    <ActionLink href="/student/insights">Full story</ActionLink>
                  </div>
                </>
              ) : (
                <div className="max-w-2xl">
                  <Meta>Your story is just starting</Meta>
                  <p className="display display-md mt-3">Numbers arrive after motion.</p>
                  <p className="narrative mt-3">
                    Nightly rollups begin once you have real activity. Connect GitHub and finish your first roadmap node — then this space becomes your growth story.
                  </p>
                  <div className="mt-5">
                    <Link href="/student/github" className="btn-ink">Connect GitHub →</Link>
                  </div>
                </div>
              )}
            </section>
          </Reveal>
        </>
      )}
    </main>
  );
}

function ComingUp({ contests, events, sessions }) {
  const rows = [
    ...(sessions || []).map((s) => ({
      when: relDate(s.scheduled_at),
      title: `Mentor session${s.mentor_name ? ` with ${s.mentor_name}` : ""}`,
      sub: s.expertise || "mentorship",
      href: "/student/mentorship"
    })),
    ...(contests || []).map((c) => ({
      when: relDate(c.ends_at || c.starts_at),
      title: c.title,
      sub: c.registered ? "registered · contest" : "contest — registration open",
      href: "/student/contests",
      hot: !c.registered
    })),
    ...(events || []).map((e) => ({
      when: relDate(e.starts_at),
      title: e.title,
      sub: `${e.event_type || "event"}${e.is_online ? " · online" : e.location ? ` · ${e.location}` : ""}${e.registered ? " · you're in" : ""}`,
      href: "/student/events"
    }))
  ].slice(0, 5);

  if (rows.length === 0) {
    return (
      <p className="narrative mt-3">
        Nothing scheduled. <Link href="/student/contests" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Browse challenges</Link> or{" "}
        <Link href="/student/events" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>find an event</Link> to put something on the horizon.
      </p>
    );
  }
  return (
    <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
      {rows.map((r, i) => (
        <li key={i} className="flex items-baseline gap-4 py-3">
          <span className="meta w-24 shrink-0">{r.when}</span>
          <span className="min-w-0 flex-1">
            <Link href={r.href} className="block truncate text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>{r.title}</Link>
            <span className="meta mt-0.5 block truncate">{r.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
