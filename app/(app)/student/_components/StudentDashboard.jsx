"use client";

import Link from "next/link";
import { Route, FolderKanban, Award, Zap, GitBranch, Flag } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { Display, Meta, ActionLink, StatusPill } from "@/components/loom/primitives";
import { Card, EmptyState } from "@/components/ui";
import { ProgressPath } from "@/components/loom/ProgressPath";
import { WeekStrip } from "@/components/loom/Heatmap";
import { ActivityStream } from "@/components/loom/Evidence";
import { OnboardingState } from "@/components/loom/States";
import { StatTile, TileGrid } from "@/components/loom/StatTiles";
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
  loop, cadence, notificationsPreview, notifUnread, projectsPreview, projectCount,
  achievementsPreview, achievementCount, credentialCount
}) {
  const name = profile?.name?.split(" ")[0] || "there";
  const done = new Set(doneIds);
  const stops = nodes.map((n) => ({
    label: n.title,
    state: done.has(n.id) ? "done" : nextNode && n.id === nextNode.id ? "now" : "todo"
  }));
  const fresh = !profile?.primary_domain || doneIds.length === 0;
  const upcoming = nodes.filter((n) => !done.has(n.id)).slice(0, 3);

  // What's next: rule-based on real state only — never invented.
  const nextActions = [];
  if (nextNode) {
    nextActions.push({
      title: nextNode.title,
      detail: `${nextNode.domain || "Roadmap"} · Milestone ${doneIds.length + 1} of ${nodes.length}`,
      href: "/student/roadmap",
      cta: "Continue",
      primary: true
    });
  }
  const openContest = (contests || []).find((c) => !c.registered);
  if (openContest) {
    nextActions.push({
      title: openContest.title,
      detail: `Contest · ends ${relDate(openContest.ends_at || openContest.starts_at)}`,
      href: "/student/contests",
      cta: "Register"
    });
  }
  const upcomingEvent = (events || []).find((e) => !e.registered);
  if (upcomingEvent) {
    nextActions.push({
      title: upcomingEvent.title,
      detail: `${upcomingEvent.event_type || "Event"} · ${relDate(upcomingEvent.starts_at)}`,
      href: "/student/events",
      cta: "Join"
    });
  }
  if ((projectCount ?? 0) === 0) {
    nextActions.push({
      title: "Ship your first project",
      detail: "Proof beats progress",
      href: "/student/projects/new",
      cta: "Start"
    });
  }
  if (!profile?.github_username) {
    nextActions.push({
      title: "Connect GitHub",
      detail: "Turn real commits into evidence",
      href: "/student/github",
      cta: "Connect"
    });
  }
  if ((sessions || []).length === 0 && (cadence?.mentors ?? 0) > 0) {
    nextActions.push({
      title: "Find a mentor",
      detail: `${cadence.mentors} ${cadence.mentors === 1 ? "guide" : "guides"} available`,
      href: "/student/mentorship",
      cta: "Browse"
    });
  }
  if (loop && !loop.isMentor && loop.eligible && loop.applicationStatus !== "pending") {
    nextActions.push({
      title: "Become a mentor",
      detail: "Your proof qualifies you to guide juniors",
      href: "/student/mentorship",
      cta: "Apply"
    });
  }
  if (nextActions.length === 0) {
    nextActions.push({
      title: "Share your proof",
      detail: "Every node complete — make it travel",
      href: "/student/credentials",
      cta: "Open"
    });
  }
  const shownActions = nextActions.slice(0, 4);

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* COMMAND HERO — status and next move beside the week pulse */}
      <Reveal>
        <section className="spot-card hero-field rounded-3xl border px-6 py-8 sm:px-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="min-w-0 flex-1">
              <Meta>{todayLabel}</Meta>
              <Display size="lg" className="mt-2">
                {greeting}, {name}.
              </Display>
              {nextNode ? (
                <>
                  <p className="narrative mt-3">
                    You are {overallPercent}% through your roadmap — {doneIds.length} of {nodes.length} milestones complete.
                  </p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Next up — </span>
                    <strong className="font-semibold">{nextNode.title}</strong>
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-4">
                    <Link href="/student/roadmap" prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Continue roadmap →</Link>
                    <ActionLink href={`/student/roadmap/${nextNode.id}`}>Node detail</ActionLink>
                  </div>
                </>
              ) : (
                <>
                  <p className="narrative mt-3">
                    The whole path, walked — {doneIds.length} of {nodes.length} milestones complete. Turn this momentum into public proof.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-4">
                    <Link href="/student/credentials" prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Share proof →</Link>
                    <ActionLink href="/student/opensource">Find an OSS issue</ActionLink>
                  </div>
                </>
              )}
            </div>
            <div className="w-full shrink-0 rounded-2xl border p-4 sm:p-5 lg:w-72" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <Meta>This week</Meta>
                <span className="meta" style={{ color: "var(--accent)" }}>
                  {weekCounts.sessions} {weekCounts.sessions === 1 ? "session" : "sessions"}
                </span>
              </div>
              <div className="mt-3">
                <WeekStrip days={weekDays} />
              </div>
              <p className="meta mt-3">
                {weekCounts.contributions} logged · Milestone {Math.min(doneIds.length + 1, Math.max(nodes.length, 1))} of {nodes.length}
              </p>
            </div>
          </div>
          <div className="mt-6 h-1.5 overflow-hidden rounded-full" role="img" aria-label={`Roadmap ${overallPercent} percent complete`} style={{ background: "var(--line)" }}>
            <div className="h-full rounded-full" style={{ width: `${overallPercent}%`, background: "linear-gradient(to right, var(--thread-cyan), var(--thread-gold))" }} />
          </div>
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
          {/* METRICS — one component, hairline dividers, individually scannable */}
          <Reveal delay={0.05}>
            <section className="mt-8" aria-label="Overview">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-3 lg:grid-cols-6" style={{ borderColor: "var(--line)", background: "var(--line)" }}>
                <MetricCell icon={Route} value={`${overallPercent}%`} label="roadmap complete" />
                <MetricCell icon={FolderKanban} value={projectCount ?? 0} unit={(projectCount ?? 0) === 1 ? "project" : "projects"} label="shipped by you" />
                <MetricCell icon={Award} value={achievementCount ?? 0} unit={(achievementCount ?? 0) === 1 ? "badge" : "badges"} label="achievements earned" />
                <MetricCell icon={Zap} value={weekCounts.sessions} unit="sessions" label="learning sessions this week" />
                <MetricCell icon={GitBranch} value={weekCounts.contributions} unit="proof" label="contributions logged this week" />
                <MetricCell icon={Flag} value={weekCounts.milestones} unit={weekCounts.milestones === 1 ? "milestone" : "milestones"} label="milestones completed this week" />
              </div>
            </section>
          </Reveal>

          {/* DASHBOARD DECK — numbered main column plus live rail */}
          <div className="mt-12 grid items-start gap-8 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-8">
              {/* 01 — WHAT'S NEXT */}
              <Reveal delay={0.05}>
                <section aria-label="What is next">
                  <SectionHead index="01" title="What is next" right={`${shownActions.length} open`} />
                  <NextActions actions={shownActions} />
                </section>
              </Reveal>

              {/* 02 — YOUR JOURNEY */}
              <Reveal delay={0.06}>
                <section className="mt-12" aria-label="Your journey">
                  <SectionHead index="02" title="Your journey" right={`${doneIds.length} of ${nodes.length} · ${overallPercent}%`} />
                  <Card>
                    <div className="mt-1">
                      <ProgressPath stops={stops} percent={overallPercent} bare ariaLabel={`${overallPercent} percent of roadmap complete`} />
                    </div>
                    {upcoming.length > 0 ? (
                      <ul className="mt-5 space-y-0.5">
                        {upcoming.map((n, i) => (
                          <li key={n.id}>
                            <Link
                              href={i === 0 && nextNode ? `/student/roadmap/${nextNode.id}` : "/student/roadmap"}
                              prefetch={false}
                              className="row-link flex items-center gap-3 px-2 py-2"
                            >
                              <span
                                className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                                style={i === 0
                                  ? { border: "1.5px solid var(--accent)", color: "var(--accent)" }
                                  : { border: "1.5px solid var(--line)", color: "var(--text-muted)" }}
                                aria-hidden="true"
                              >
                                {i === 0 ? "→" : i + 1}
                              </span>
                              <span
                                className="min-w-0 flex-1 truncate text-sm font-medium"
                                style={{ color: i === 0 ? "var(--text)" : "var(--text-muted)" }}
                              >
                                {n.title}
                              </span>
                              {i === 0 && (
                                <span className="meta shrink-0" style={{ color: "var(--accent)" }}>you are here</span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="narrative mt-5">Every milestone complete. The loop below is how you stay in motion.</p>
                    )}
                    <div className="mt-4 flex justify-end">
                      <ActionLink href="/student/roadmap">Open the path</ActionLink>
                    </div>
                  </Card>
                </section>
              </Reveal>

              {/* 03 — BUILDING */}
              <Reveal delay={0.07}>
                <section className="mt-12" aria-label="Things you are building">
                  <SectionHead index="03" title="Things you are building" right={`${projectCount ?? 0} shipped`} />
                  <div className="mt-1 flex justify-end">
                    <ActionLink href="/student/projects">All projects</ActionLink>
                  </div>
                  <ProjectsPreview projects={projectsPreview} />
                </section>
              </Reveal>

              {/* 04 — RHYTHM */}
              <Reveal delay={0.06}>
                <section className="mt-12" aria-label="Chapter rhythm">
                  <SectionHead index="04" title="Chapter rhythm" right="year-round, not once a semester" />
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
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

              {/* 05 — THE LOOP */}
              <Reveal delay={0.05}>
                <section className="mt-12" aria-label="The loop">
                  <SectionHead index="05" title="The loop continues through you" />
                  <Card>
                    <p className="meta">
                      Stage {Math.min((loop?.stageIndex ?? 0) + 1, 6)} of 6 — {LOOP_STAGES[Math.min(loop?.stageIndex ?? 0, 5)]}
                    </p>
                    <LoopStrip stage={loop?.stageIndex ?? 0} />
                    <LoopBody loop={loop} />
                  </Card>
                </section>
              </Reveal>
            </div>

            {/* LIVE RAIL — one grouped surface for attention and quick scanning */}
            <aside className="min-w-0 lg:col-span-4" aria-label="Live from your chapter">
              <Reveal delay={0.05}>
                <Card>
                  <div className="flex items-baseline justify-between gap-2">
                    <Meta>Inbox</Meta>
                    {notifUnread > 0 ? (
                      <span className="meta" style={{ color: "var(--accent)" }}>{notifUnread} unread</span>
                    ) : (
                      <ActionLink href="/student/notifications">View all</ActionLink>
                    )}
                  </div>
                  <NotificationsPreview items={notificationsPreview} />
                  {notifUnread > 0 && (
                    <div className="mt-3 text-right">
                      <ActionLink href="/student/notifications">View all</ActionLink>
                    </div>
                  )}
                  <div className="rule mt-6" aria-hidden="true" />
                  <div className="mt-6 flex items-baseline justify-between gap-2">
                    <Meta>Coming up</Meta>
                    <ActionLink href="/student/events">Calendar</ActionLink>
                  </div>
                  <ComingUp contests={contests} events={events} sessions={sessions} />
                  <div className="rule mt-6" aria-hidden="true" />
                  <div className="mt-6 flex items-baseline justify-between gap-2">
                    <Meta>Evidence</Meta>
                    <ActionLink href="/student/credentials">Open proof</ActionLink>
                  </div>
                  <AchievementsPreview items={achievementsPreview} credentialCount={credentialCount} />
                  <p className="meta mt-5">Latest proof</p>
                  <div className="mt-1">
                    {proof.length > 0 ? (
                      <ActivityStream items={proof} />
                    ) : (
                      <p className="narrative mt-2">Nothing recorded yet. Finish a node or ship a project — it will appear here, with evidence attached.</p>
                    )}
                  </div>
                </Card>
              </Reveal>
            </aside>
          </div>

          {/* GROWTH STORY — insights folded in, never a dead end */}
          <Reveal delay={0.05}>
            <section className="mt-12 border-t pt-10" style={{ borderColor: "var(--line)" }} aria-label="Your growth">
              {snapshot ? (
                <>
                  <Meta>Your last 30 days</Meta>
                  <TileGrid cols={3}>
                    <StatTile value={`${Number(snapshot.consistency_score || 0)}%`} label="days active out of the last 30" pct={Number(snapshot.consistency_score || 0)} />
                    <StatTile value={`${Number(snapshot.roadmap_completion_pct || 0)}%`} label="roadmap complete and climbing" pct={Number(snapshot.roadmap_completion_pct || 0)} />
                    <StatTile value={snapshot.total_commits ?? 0} unit="commits" label="in the last 30 days" />
                  </TileGrid>
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

      {/* COMMUNITY & GROWTH — departments, volunteering, and the chapter feed */}
      <section className="mt-12 border-t pt-10" style={{ borderColor: "var(--line)" }} aria-label="Community and growth">
        <Meta>Community &amp; growth</Meta>
        <p className="narrative mt-2">Departments, volunteering, and the chapter feed — where learning turns social.</p>
        <div className="mt-6">
          <DepartmentsSection />
        </div>
      </section>

      {/* FINALE — the page closes on motion, not on database sections */}
      <Reveal>
        <section className="hero-field mt-12 rounded-3xl border px-6 py-10 text-center sm:px-10" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Keep building">
          <Meta>Keep building</Meta>
          <p className="display display-md mx-auto mt-3">Keep building, {name}.</p>
          <p className="narrative mx-auto mt-3 text-center">
            Progress becomes proof when learning turns into projects, contributions, and community.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/student/roadmap" prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Continue roadmap →</Link>
            <Link href="/student/projects" prefetch={false} className="btn-ghost !px-6 !py-3 !text-base">Explore projects</Link>
          </div>
        </section>
      </Reveal>
    </main>
  );
}

/* Numbered editorial section header for the main column. */
function SectionHead({ index, title, right }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="index-num" aria-hidden="true">{index}</span>
      <Meta>{title}</Meta>
      {right && <span className="meta ml-auto text-right">{right}</span>}
    </div>
  );
}

/* One metric cell inside the hairline-divider overview grid. */
function MetricCell({ icon: Icon, value, unit, label }) {
  return (
    <div className="flex items-start gap-3 p-4 sm:p-5" style={{ background: "var(--bg-elevated)" }}>
      <Icon size={16} strokeWidth={1.75} style={{ color: "var(--accent)" }} className="mt-1 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-display text-[1.65rem] font-medium leading-none" style={{ color: "var(--text)" }}>
          {value}
          {unit && <span className="ml-2 align-middle font-sans text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>{unit}</span>}
        </p>
        <p className="meta mt-2 leading-relaxed">{label}</p>
      </div>
    </div>
  );
}

function RhythmRow({ label, detail, href }) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        prefetch={false}
        className="flex h-full flex-col justify-between gap-3 rounded-xl border p-4 transition hover:-translate-y-0.5"
        style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{label}</span>
          <span className="meta mt-1.5 block leading-relaxed">{detail}</span>
        </span>
        <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Open →</span>
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

/* Numbered action rows — the primary row carries the wash tint + solid CTA. */
function NextActions({ actions }) {
  return (
    <ul className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      {actions.map((a, i) => (
        <li
          key={`${a.href}-${a.title}`}
          className={i > 0 ? "border-t" : ""}
          style={{ borderColor: "var(--line)", background: a.primary ? "var(--wash)" : "transparent" }}
        >
          <Link href={a.href} prefetch={false} className="row-link flex items-center gap-4 px-4 py-4 sm:px-5">
            <span className="index-num w-6 shrink-0" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.95rem] font-semibold" style={{ color: "var(--text)" }}>{a.title}</span>
              <span className="meta mt-1 block truncate">{a.detail}</span>
            </span>
            <span
              className={a.primary ? "btn-ink shrink-0 !px-4 !py-2 !text-xs" : "shrink-0 text-xs font-semibold"}
              style={a.primary ? undefined : { color: "var(--accent)" }}
            >
              {a.cta} →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NotificationsPreview({ items }) {
  if (!items || items.length === 0) {
    return (
      <p className="narrative mt-3">
        All caught up. Mentions, reviews, and chapter news land here the moment they happen.
      </p>
    );
  }
  return (
    <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
      {items.map((n) => (
        <li key={n.id}>
          <Link href={n.link || "/student/notifications"} prefetch={false} className="row-link flex items-start gap-3 px-2 py-2.5">
            <span
              className="mt-1.5 size-1.5 shrink-0 rounded-full"
              style={{ background: n.read_at ? "var(--line)" : "var(--accent)" }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-5" style={{ color: "var(--text)" }}>{n.title}</span>
              {n.body && <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-muted)" }}>{n.body}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProjectsPreview({ projects }) {
  if (!projects || projects.length === 0) {
    return (
      <EmptyState
        title="Ship your first build."
        body="Projects turn learning into proof — they feed your profile, credentials, and reports. Start small, ship publicly, iterate."
        action={<Link href="/student/projects/new" prefetch={false} className="btn-ink">Start a project →</Link>}
      />
    );
  }
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {projects.map((p) => (
        <li key={p.id} className="min-w-0 rounded-xl border p-4 transition hover:-translate-y-0.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex items-start justify-between gap-3">
            <Link href={`/student/projects/${p.id}`} prefetch={false} className="min-w-0 truncate text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>
              {p.title}
            </Link>
            <StatusPill tone={p.status === "active" ? "live" : ""}>{p.status}</StatusPill>
          </div>
          {Array.isArray(p.tags) && p.tags.length > 0 && (
            <p className="meta mt-1.5 truncate">{p.tags.join(" · ")}</p>
          )}
          {p.description && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{p.description}</p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {p.repo_url && (
              <a href={p.repo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Repository →
              </a>
            )}
            <Link href={`/student/projects/${p.id}`} prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              Open →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

const ACHIEVEMENT_SOURCE_LABELS = { oss: "Open source", contest: "Contest", roadmap: "Roadmap", manual: "Chapter" };

function AchievementsPreview({ items, credentialCount }) {
  if (!items || items.length === 0) {
    return (
      <p className="narrative mt-3">
        No badges yet. Finish roadmap milestones, merge pull requests, or place in contests — verified work becomes proof that travels.
      </p>
    );
  }
  return (
    <div>
      <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
        {items.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                {a.badge_name || `${ACHIEVEMENT_SOURCE_LABELS[a.source_type] || "Chapter"} contribution`}
              </span>
              <span className="meta mt-0.5 block">
                {a.earned_at ? new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : ""}
                {a.evidence_url ? " · verified" : ""}
              </span>
            </span>
            <StatusPill tone={a.level === "gold" ? "gold" : ""}>{a.level}</StatusPill>
          </li>
        ))}
      </ul>
      {(credentialCount ?? 0) > 0 && (
        <p className="meta mt-3">
          {credentialCount} verifiable credential{(credentialCount ?? 0) === 1 ? "" : "s"} issued — share them from your proof page.
        </p>
      )}
    </div>
  );
}

/* WHAT / WHEN / ACTION rows — every upcoming item answers all three. */
function ComingUp({ contests, events, sessions }) {
  const rows = [
    ...(sessions || []).map((s) => ({
      when: relDate(s.scheduled_at),
      title: `Mentor session${s.mentor_name ? ` with ${s.mentor_name}` : ""}`,
      sub: s.expertise || "mentorship",
      href: "/student/mentorship",
      action: "Open"
    })),
    ...(contests || []).map((c) => ({
      when: relDate(c.ends_at || c.starts_at),
      title: c.title,
      sub: c.registered ? "registered · contest" : "contest — registration open",
      href: "/student/contests",
      action: c.registered ? "View" : "Register"
    })),
    ...(events || []).map((e) => ({
      when: relDate(e.starts_at),
      title: e.title,
      sub: `${e.event_type || "event"}${e.is_online ? " · online" : e.location ? ` · ${e.location}` : ""}${e.registered ? " · you're in" : ""}`,
      href: "/student/events",
      action: e.registered ? "View" : "Join"
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
        <li key={i} className="flex items-center gap-3 py-2.5">
          <span className="meta w-20 shrink-0">{r.when}</span>
          <span className="min-w-0 flex-1">
            <Link href={r.href} prefetch={false} className="block truncate text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>{r.title}</Link>
            <span className="meta mt-0.5 block truncate">{r.sub}</span>
          </span>
          <Link href={r.href} prefetch={false} className="shrink-0 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            {r.action} →
          </Link>
        </li>
      ))}
    </ul>
  );
}
