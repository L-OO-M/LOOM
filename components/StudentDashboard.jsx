"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Display, Meta, ActionLink, PlainStat } from "@/components/loom/primitives";
import { ProgressPath } from "@/components/loom/ProgressPath";
import { WeekStrip } from "@/components/loom/Heatmap";
import { ActivityStream } from "@/components/loom/Evidence";
import { OnboardingState } from "@/components/loom/States";
import { DepartmentsSection } from "@/components/student/OrgPanels";

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

const LOOP_STAGES = ["Beginner", "Learn", "Practice", "Build", "Collaborate", "Mentor"];

export function StudentDashboard({
  profile, greeting, todayLabel, nextNode, nodes, doneIds, overallPercent,
  nextMilestone, weekDays, weekCounts, contests, events, sessions, proof, snapshot, peers,
  loop, cadence
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
        <section className="spot-card hero-field rounded-3xl border px-6 py-10 sm:px-10 sm:py-14" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
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
                <Link href="/student/roadmap" prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Continue →</Link>
                <ActionLink href={`/student/roadmap/${nextNode.id}`}>Node detail</ActionLink>
              </div>
            </div>
          ) : (
            <div className="mt-8 max-w-xl">
              <Meta style={{ color: "var(--accent)" }}>A quiet milestone</Meta>
              <p className="display display-md mt-2">The whole path, walked.</p>
              <p className="narrative mt-3">Every node complete. Turn this momentum into public proof — or mentor someone two steps behind you.</p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link href="/student/credentials" prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Share proof →</Link>
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
              action={<Link href="/student/roadmap" prefetch={false} className="btn-ink">Open your roadmap →</Link>}
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

          {/* RHYTHM — the week's living cadence */}
          <Reveal delay={0.06}>
            <section className="mt-12" aria-label="This week's rhythm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Meta>The rhythm</Meta>
                <span className="meta">year-round, not once a semester</span>
              </div>
              <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
                <RhythmRow
                  label="Beginner workshops"
                  detail={cadence?.workshop ? `${cadence.workshop.title} · ${relDate(cadence.workshop.when)}` : "none scheduled — propose one to your chapter"}
                  href="/student/events"
                />
                <RhythmRow
                  label="Weekly practice"
                  detail={(cadence?.contests ?? 0) > 0 ? `${cadence.contests} open challenges` : "no open challenges right now"}
                  href="/student/contests"
                />
                <RhythmRow
                  label="Peer mentorship"
                  detail={(cadence?.mentors ?? 0) > 0 ? `${cadence.mentors} guides available` : "no guides yet — be the reason there are"}
                  href="/student/mentorship"
                />
                <RhythmRow
                  label="Mini-projects"
                  detail={(cadence?.projects ?? 0) > 0 ? `${cadence.projects} shipped by you` : "nothing shipped yet — proof beats progress"}
                  href="/student/projects"
                />
                <RhythmRow
                  label="Tech talks"
                  detail={(cadence?.talks ?? 0) > 0 ? `${cadence.talks} upcoming` : "none upcoming"}
                  href="/student/events"
                />
                <RhythmRow
                  label="OSS sprints"
                  detail={(cadence?.oss ?? 0) > 0 ? `${cadence.oss} curated repos waiting` : "no curated repos yet"}
                  href="/student/opensource"
                />
              </ul>
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

          {/* LOOP — the generational cycle, made personal */}
          <Reveal delay={0.05}>
            <section className="mt-12 border-t pt-10" style={{ borderColor: "var(--line)" }} aria-label="The loop">
              <Meta>The loop continues through you</Meta>
              <LoopStrip stage={loop?.stageIndex ?? 0} />
              <LoopBody loop={loop} />
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
                    <Link href="/student/github" prefetch={false} className="btn-ink">Connect GitHub →</Link>
                  </div>
                </div>
              )}
            </section>
          </Reveal>
        </>
      )}
      {/* DEPARTMENTS — outside the fresh/activity split so even a day-one
          member can join a domain, request Core, and log work from here. */}
      <section className="mt-12 border-t pt-10" style={{ borderColor: "var(--line)" }}>
        <DepartmentsSection />
      </section>
    </main>
  );
}

function RhythmRow({ label, detail, href }) {
  return (
    <li>
      <Link href={href} prefetch={false} className="row-link flex items-baseline justify-between gap-4 px-2 py-2.5">
        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</span>
        <span className="meta truncate text-right">{detail}</span>
      </Link>
    </li>
  );
}

function LoopStrip({ stage }) {
  return (
    <ol className="mt-5 flex flex-wrap items-center gap-y-3" aria-label={`You are at: ${LOOP_STAGES[Math.min(stage, 5)]}`}>
      {LOOP_STAGES.map((s, i) => (
        <li key={s} className="flex items-center">
          <span className="flex items-center gap-2">
            <span
              className="grid size-6 place-items-center rounded-full text-[10px] font-bold"
              style={i < stage
                ? { background: "var(--accent)", color: "#101314" }
                : i === stage
                  ? { border: "1.5px solid var(--accent)", color: "var(--text)", boxShadow: "0 0 0 3px var(--accent-glow)" }
                  : { border: "1.5px solid var(--line)", color: "var(--text-muted)" }}
              aria-hidden="true"
            >
              {i < stage ? "✓" : i + 1}
            </span>
            <span className="pr-1 text-xs font-semibold" style={{ color: i <= stage ? "var(--text)" : "var(--text-muted)" }}>{s}</span>
          </span>
          {i < LOOP_STAGES.length - 1 && (
            <span className="mx-1.5 text-xs" style={{ color: "var(--line)" }} aria-hidden="true">·</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function LoopBody({ loop }) {
  if (!loop) return null;
  if (loop.isMentor) {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You close the loop. Juniors are waiting — <strong style={{ color: "var(--text)" }}>guide the next intake</strong>.
        </p>
        <ActionLink href="/student/mentorship">Your mentees</ActionLink>
      </div>
    );
  }
  if (loop.applicationStatus === "pending") {
    return (
      <p className="mt-5 text-sm" style={{ color: "var(--text-muted)" }}>
        Your mentor application is <strong style={{ color: "var(--accent)" }}>under review</strong>.
        Reviewers judge proof, not promises — meanwhile, answering threads below counts twice.
      </p>
    );
  }
  if (loop.eligible) {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Your proof speaks: {loop.stats?.pct}% of the path, {loop.stats?.proof} public contribution{loop.stats?.proof === 1 ? "" : "s"}.{" "}
          <strong style={{ color: "var(--text)" }}>You're ready to mentor.</strong>
        </p>
        <Link href="/student/mentorship" prefetch={false} className="btn-ink">Become a mentor →</Link>
      </div>
    );
  }
  const threads = loop.openThreads || [];
  return (
    <div className="mt-5">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Mentor candidacy needs {loop.stats ? `${Math.max(0, Math.round(40 - loop.stats.pct))}% more path` : "path progress"}
        {loop.stats?.proof === 0 ? " plus one public contribution" : ""}. Fastest honest route: answer a stuck peer.
      </p>
      {threads.length > 0 && (
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/student/community/forums/${t.id}`} prefetch={false} className="row-link flex items-baseline justify-between gap-3 px-2 py-2">
                <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{t.title}</span>
                <span className="meta shrink-0">0 replies · answer →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
        Nothing scheduled. <Link href="/student/contests" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Browse challenges</Link> or{" "}
        <Link href="/student/events" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>find an event</Link> to put something on the horizon.
      </p>
    );
  }
  return (
    <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
      {rows.map((r, i) => (
        <li key={i} className="flex items-baseline gap-4 py-3">
          <span className="meta w-24 shrink-0">{r.when}</span>
          <span className="min-w-0 flex-1">
            <Link href={r.href} prefetch={false} className="block truncate text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>{r.title}</Link>
            <span className="meta mt-0.5 block truncate">{r.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
