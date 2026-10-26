"use client";

import Image from "next/image";
import Link from "next/link";
import { FolderKanban, GitPullRequest, Map as MapIcon } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { ActionLink } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import { DepartmentsSection } from "@/components/student/OrgPanels";
import { PLANNER_ENABLED } from "@/lib/feature-flags";
import { domainArt, eventArt } from "@/lib/artwork";
import "./student-folio.css";

function relDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date(); now.setHours(0,0,0,0);
  const day = new Date(d); day.setHours(0,0,0,0);
  const diff = Math.round((day - now) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}
function relShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

const LOOP_STAGES = ["Beginner", "Learn", "Practice", "Build", "Collaborate", "Mentor"];

function proofIcon(meta) {
  if (/open source/i.test(meta)) return GitPullRequest;
  if (/project/i.test(meta)) return FolderKanban;
  return MapIcon;
}

function projectArt(project, fallback) {
  const tag = (project?.tags || []).find((t) => domainArt(t));
  return domainArt(tag) || fallback;
}

export function StudentDashboard({
  profile, greeting, todayLabel, nextNode, nodes, doneIds, overallPercent,
  nextMilestone, weekDays, weekCounts, contests, events, sessions, proof, snapshot, peers,
  loop, cadence, notificationsPreview, notifUnread, projectsPreview, projectCount,
  achievementsPreview, achievementCount, credentialCount
}) {
  const name = profile?.name?.split(" ")[0] || "there";
  const done = new Set(doneIds);
  const fresh = !profile?.primary_domain || doneIds.length === 0;
  const remaining = nodes.length - doneIds.length;
  const domainLabel = nextNode?.domain ? nextNode.domain.replace(/_/g, " ").replace(/\b\w/g, c=>c.toUpperCase()) : "Roadmap";
  const heroArt = domainArt(profile?.primary_domain);
  const currentIndex = nextNode
    ? Math.max(0, nodes.findIndex((n) => n.id === nextNode.id))
    : Math.max(0, nodes.length - 1);
  const journeyWindow = Math.min(5, nodes.length);
  let journeyStart = Math.max(0, currentIndex - 1);
  if (journeyStart + journeyWindow > nodes.length) journeyStart = Math.max(0, nodes.length - journeyWindow);
  const journeyStops = nodes.slice(journeyStart, journeyStart + journeyWindow).map((n, i) => ({
    id: n.id,
    number: journeyStart + i + 1,
    title: n.title,
    state: done.has(n.id) ? "done" : nextNode && n.id === nextNode.id ? "now" : "todo",
    queue: journeyStart + i - currentIndex
  }));
  const upcoming = [
    ...(sessions || []).map((s) => ({
      when: relDay(s.scheduled_at),
      title: s.mentor_name ? `Mentor session with ${s.mentor_name}` : "Mentor session",
      sub: s.expertise || "mentorship",
      href: "/student/mentorship",
      art: eventArt("mentoring")
    })),
    ...(contests || []).map((c) => ({
      when: relDay(c.ends_at || c.starts_at),
      title: c.title,
      sub: c.registered ? "registered / contest" : "contest / registration open",
      href: "/student/contests",
      art: eventArt("contest")
    })),
    ...(events || []).map((e) => ({
      when: relDay(e.starts_at),
      title: e.title,
      sub: `${e.event_type || "event"}${e.is_online ? " / online" : e.location ? ` / ${e.location}` : ""}`,
      href: "/student/events",
      art: eventArt(e.event_type)
    }))
  ].slice(0, 5);
  const loopStage = Math.min((loop?.stageIndex ?? 0) + 1, 6);
  const weekPeak = Math.max(1, ...weekDays.map((d) => d.count || 0));
  const signalMax = Math.max(1, weekCounts.sessions, weekCounts.contributions, weekCounts.milestones);
  const projectCards = (projectsPreview || []).slice(0, 2);

  return (
    <main className="desk mx-auto max-w-6xl px-4 sm:px-6">
      <Reveal>
        <section className="desk-hero" aria-labelledby="desk-hero-title">
          {heroArt && (
            <Image
              src={heroArt}
              alt=""
              fill
              sizes="(max-width: 899px) 100vw, 46vw"
              className="desk-hero-art"
            />
          )}
          <div className="desk-hero-inner">
            <div className="desk-hero-main">
              <p className="desk-kicker">
                <span>{greeting}</span>
                <span>{todayLabel}</span>
              </p>
              {nextNode ? (
                <>
                  <h1 id="desk-hero-title" className="desk-title">{nextNode.title}</h1>
                  <p className="desk-lede">
                    You are <strong>{remaining === 1 ? "1 step" : `${remaining} steps`} away</strong> from completing your next {domainLabel} milestone.
                  </p>
                  <p className="desk-meta-line">
                    {nextNode.domain ? `${nextNode.domain.replace(/_/g, " ")} / ` : ""}
                    Roadmap / {nextNode.difficulty_level || "Milestone"}
                  </p>
                  <div className="desk-actions">
                    <Link href={`/student/roadmap/${nextNode.id}`} prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Continue &rarr;</Link>
                    <Link href="/student/roadmap" prefetch={false} className="btn-ghost !px-6 !py-3 !text-base">View roadmap</Link>
                    {PLANNER_ENABLED ? <Link href="/student/planner" prefetch={false} className="btn-ghost !px-6 !py-3 !text-base">Weekly planner</Link> : null}
                  </div>
                </>
              ) : (
                <>
                  <h1 id="desk-hero-title" className="desk-title">The whole path, walked.</h1>
                  <p className="desk-lede">
                    Every milestone complete - {doneIds.length} of {nodes.length}. Turn momentum into public proof.
                  </p>
                  <div className="desk-actions">
                    <Link href="/student/credentials" prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Share proof &rarr;</Link>
                    <Link href="/student/opensource" prefetch={false} className="btn-ghost !px-6 !py-3 !text-base">Find an OSS issue</Link>
                    {PLANNER_ENABLED ? <Link href="/student/planner" prefetch={false} className="btn-ghost !px-6 !py-3 !text-base">Open planner</Link> : null}
                  </div>
                </>
              )}
            </div>

            <aside className="desk-pass" aria-label="Milestone record">
              <p className="desk-label">Milestone record</p>
              <p className="desk-pass-value">{overallPercent}<span>%</span></p>
              <p className="desk-pass-note">{doneIds.length} of {nodes.length} milestones complete</p>
              <div className="desk-pass-track" role="img" aria-label={`${overallPercent} percent of the roadmap complete`}>
                <span style={{ width: `${overallPercent}%` }} />
              </div>
              <dl className="desk-pass-list">
                <div>
                  <dt>Next</dt>
                  <dd title={nextNode?.title || "Complete"}>{nextNode?.title || "Track complete"}</dd>
                </div>
                <div>
                  <dt>Track</dt>
                  <dd title={domainLabel}>{domainLabel}</dd>
                </div>
                <div>
                  <dt>Today</dt>
                  <dd title={todayLabel}>{todayLabel}</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>
      </Reveal>

      {fresh ? (
        <Reveal delay={0.06}>
          <section className="mt-2">
            <OnboardingState
              eyebrow="Your first week"
              title="Three small steps unlock everything."
              why="LOOM reads your real activity - roadmap progress, commits, shipped projects - and turns it into proof."
              steps={[
                { title: "Set your direction", body: "Pick a track in onboarding so recommendations point correctly." },
                { title: "Finish your first node", body: "Open the roadmap and complete milestone one. The next unlocks itself." },
                { title: "Connect GitHub", body: "Real commits become growth evidence, automatically." }
              ]}
              action={<Link href="/student/roadmap" prefetch={false} className="btn-ink">Open your roadmap &rarr;</Link>}
            />
          </section>
        </Reveal>
      ) : (
        <>
          <Reveal delay={0.04}>
            <section className="desk-band" aria-label="This week">
              <div className="desk-band-head">
                <p className="desk-label">This week</p>
                <p className="desk-mono">{weekCounts.sessions} sessions / {weekCounts.contributions} contributions / {weekCounts.milestones} milestones</p>
              </div>
              <div className="desk-week-grid">
                {weekDays.map((d) => (
                  <div key={d.label} className={`desk-day ${d.hit ? "is-hit" : ""} ${d.today ? "is-today" : ""}`}>
                    <span className="desk-day-label">{d.label.slice(0,3).toUpperCase()}</span>
                    <span className="desk-day-mark" aria-label={`${d.label} ${d.hit ? "active" : "quiet"}${d.today ? " today" : ""}`} />
                  </div>
                ))}
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.05}>
            <section className="desk-section" aria-labelledby="desk-journey-title">
              <div className="desk-section-head">
                <span className="desk-index">02</span>
                <h2 id="desk-journey-title">Your journey</h2>
                <span className="desk-note">{doneIds.length} of {nodes.length} complete</span>
              </div>
              <p className="desk-section-lede">Five milestones around where you stand - the rest of the path stays queued, not crammed.</p>
              <div className="desk-journey-board">
                <span className="desk-journey-shader" aria-hidden="true" />
                <div className="desk-journey-aside">
                  <p className="desk-label">Milestone in focus</p>
                  <p className="desk-journey-count">
                    {String(nodes.length ? currentIndex + 1 : 0).padStart(2, "0")}
                    <span> / {nodes.length}</span>
                  </p>
                  <p className="desk-journey-caption">{doneIds.length} complete / {remaining} to go</p>
                  <div className="desk-journey-meter" role="img" aria-label={`${overallPercent} percent of the roadmap complete`}>
                    <span style={{ width: `${overallPercent}%` }} />
                  </div>
                  <div className="desk-journey-now">
                    <span className="desk-label">Now</span>
                    <p>{nextNode?.title || "Track complete"}</p>
                  </div>
                  <ActionLink href="/student/roadmap">Open the path</ActionLink>
                </div>
                <ol className="desk-journey-stops">
                  {journeyStops.map((s) => (
                    <li
                      key={s.id}
                      className={`desk-journey-stop is-${s.state}`}
                      aria-current={s.state === "now" ? "step" : undefined}
                    >
                      <span className="desk-journey-dot" aria-hidden="true">{String(s.number).padStart(2, "0")}</span>
                      <span className="desk-journey-copy">
                        <span className="desk-journey-title">{s.title}</span>
                        <span className="desk-journey-state">
                          {s.state === "done" ? "Complete" : s.state === "now" ? "You are here" : s.queue === 1 ? "Up next" : "Queued"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          </Reveal>

          <div className="mt-2 grid gap-8 lg:grid-cols-[1.65fr_1fr] lg:gap-10">
            <div className="min-w-0">
              <Reveal delay={0.04}>
                <section className="desk-section" aria-labelledby="desk-proof-title">
                  <div className="desk-section-head">
                    <span className="desk-index">03</span>
                    <h2 id="desk-proof-title">Recent proof</h2>
                    <span className="desk-note">What you actually did</span>
                  </div>
                  <p className="desk-section-lede">A record of finished work, not a list of intentions.</p>
                  {proof.length>0 ? (
                    <ol className="desk-stream">
                      {proof.map((p,i) => {
                        const Icon = proofIcon(p.meta);
                        return (
                          <li key={i} className="desk-stream-item">
                            <span className="desk-stream-marker" aria-hidden="true">
                              <Icon size={14} strokeWidth={1.8} />
                            </span>
                            <div className="desk-stream-copy">
                              <span className="desk-stream-top">
                                <span className="desk-stream-date">{p.when || "Recent"}</span>
                                <span className="desk-stream-meta">{p.meta}{p.hot ? " / verified" : ""}</span>
                              </span>
                              <p className="desk-stream-title">{p.text}</p>
                            </div>
                            {p.href ? (
                              <Link href={p.href} prefetch={false} className="desk-stream-action">View &rarr;</Link>
                            ) : <span />}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="desk-empty">Nothing recorded yet. Finish a node or ship a project - it will appear here with evidence attached.</p>
                  )}
                  <div className="mt-4">
                    <ActionLink href="/student/credentials">Open proof</ActionLink>
                  </div>
                </section>
              </Reveal>

              <Reveal delay={0.05}>
                <section className="desk-section" aria-labelledby="desk-upcoming-title">
                  <div className="desk-section-head">
                    <span className="desk-index">04</span>
                    <h2 id="desk-upcoming-title">Coming up</h2>
                    <span className="desk-note">On the chapter horizon</span>
                  </div>
                  {upcoming.length > 0 ? (
                    <ul className="desk-up-list">
                      {upcoming.map((r,i) => (
                        <li key={i} className="desk-up-row">
                          <span className="desk-up-art" aria-hidden="true">
                            {r.art && <Image src={r.art} alt="" fill sizes="48px" />}
                          </span>
                          <span className="desk-up-time">{r.when}</span>
                          <span className="min-w-0">
                            <Link href={r.href} prefetch={false} className="desk-up-title">{r.title}</Link>
                            <span className="desk-up-sub">{r.sub}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="desk-empty">
                      Nothing scheduled. <Link href="/student/contests" prefetch={false} className="desk-inline-link">Browse challenges</Link> or <Link href="/student/events" prefetch={false} className="desk-inline-link">find an event</Link>.
                    </p>
                  )}
                </section>
              </Reveal>

              <Reveal delay={0.04}>
                <section className="desk-section" aria-labelledby="desk-building-title">
                  <div className="desk-section-head">
                    <span className="desk-index">05</span>
                    <h2 id="desk-building-title">Things you are building</h2>
                    <span className="desk-note">{projectCount ?? 0} shipped</span>
                  </div>
                  {projectCards.length>0 ? (
                    <div className="desk-build-grid">
                      {projectCards.map((p, i) => {
                        const art = projectArt(p, heroArt);
                        return (
                          <Link key={p.id} href={`/student/projects/${p.id}`} prefetch={false} className="desk-build-card">
                            <span className="desk-build-media">
                              {art && <Image src={art} alt="" fill sizes="(max-width: 639px) 100vw, 360px" />}
                              <span className="desk-build-media-shade" />
                              <span className="desk-build-status">{p.status}</span>
                              <span className="desk-build-index">{String(i + 1).padStart(2, "0")}</span>
                            </span>
                            <span className="desk-build-content">
                              <span className="desk-build-title">{p.title}</span>
                              {p.description && <span className="desk-build-desc">{p.description}</span>}
                              <span className="desk-build-open">Go to project &rarr;</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="desk-build mt-4">
                      <span className="desk-build-status">Open call</span>
                      <p className="desk-build-title">Ship your first build.</p>
                      <p className="desk-build-body">Projects turn learning into proof - they feed your profile, credentials, and reports.</p>
                      <Link href="/student/projects/new" prefetch={false} className="btn-ink mt-4 inline-block">Create project &rarr;</Link>
                    </div>
                  )}
                  <div className="mt-3">
                    <ActionLink href="/student/projects">All projects</ActionLink>
                  </div>
                </section>
              </Reveal>
            </div>

            <aside className="desk-rail" aria-label="Live">
              <Reveal delay={0.04}>
                <section className="desk-rail-card" aria-labelledby="desk-cadence-title">
                  <div className="desk-rail-head">
                    <h3 id="desk-cadence-title" className="desk-rail-title">Cadence</h3>
                    <span className="desk-mono">Last 7 days</span>
                  </div>
                  <div
                    className="desk-chart"
                    role="img"
                    aria-label={`Daily activity: ${weekDays.map((d) => `${d.label} ${d.count || 0}`).join(", ")}`}
                  >
                    {weekDays.map((d) => (
                      <span key={d.label} className={`desk-chart-day ${d.today ? "is-today" : ""}`}>
                        <span className="desk-chart-bar-wrap">
                          <span className="desk-chart-bar" style={{ height: `${Math.max(4, ((d.count || 0) / weekPeak) * 100)}%` }} />
                        </span>
                        <span className="desk-chart-label">{d.label.slice(0, 1)}</span>
                      </span>
                    ))}
                  </div>
                  <div className="desk-signal-list">
                    {[
                      ["Sessions", weekCounts.sessions],
                      ["Contributions", weekCounts.contributions],
                      ["Milestones", weekCounts.milestones]
                    ].map(([label, value]) => (
                      <div key={label} className="desk-signal-row">
                        <span className="desk-signal-label">{label}</span>
                        <span className="desk-signal-value">{value}</span>
                        <span className="desk-signal-track">
                          <span style={{ width: `${(value / signalMax) * 100}%` }} />
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="desk-rail-sub">Real activity from GitHub and completed milestones.</p>
                </section>
              </Reveal>

              <Reveal delay={0.04}>
                <section className="desk-rail-card">
                  <div className="desk-rail-head">
                    <h3 className="desk-rail-title">Inbox</h3>
                    {notifUnread>0 ? <span className="desk-note" style={{ color:"var(--desk-thread)" }}>{notifUnread} unread</span> : <ActionLink href="/student/notifications">History</ActionLink>}
                  </div>
                  {notificationsPreview && notificationsPreview.length>0 ? (
                    <ul className="desk-mini-list">
                      {notificationsPreview.slice(0,5).map(n=>(

                        <li key={n.id} className="flex gap-2.5">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: n.read_at?"var(--desk-line)":"var(--desk-thread)" }} aria-hidden="true" />
                          <Link href={n.link||"/student/notifications"} prefetch={false} className="min-w-0">
                            <span className="desk-mini-title">{n.title}</span>
                            {n.body && <span className="desk-mini-meta">{n.body}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="desk-rail-sub">All caught up. Mentions and chapter news land here.</p>
                  )}
                </section>
              </Reveal>

              <Reveal delay={0.05}>
                <section className="desk-rail-card" aria-labelledby="desk-rhythm-title">
                  <div className="desk-rail-head">
                    <h3 id="desk-rhythm-title" className="desk-rail-title">Chapter rhythm</h3>
                    <span className="desk-mono">Year-round</span>
                  </div>
                  <div className="mt-2">
                    {[
                      [cadence?.workshop?`${cadence.workshop.title} / ${relShort(cadence.workshop.when)}`:"no workshop - propose one","Workshops","/student/events"],
                      [`${cadence?.contests??0} open`, "Challenges","/student/contests"],
                      [`${cadence?.mentors??0} guides`, "Mentors","/student/mentorship"],
                      [`${cadence?.projects??0} shipped`, "Projects","/student/projects"],
                      [`${cadence?.oss??0} repos`, "OSS","/student/opensource"]
                    ].map(([detail,label,href],i)=>(
                      <Link key={i} href={href} prefetch={false} className="desk-rhythm-row">
                        <span>{label}</span>
                        <span>{detail} &rarr;</span>
                      </Link>
                    ))}
                  </div>
                </section>
              </Reveal>

              <Reveal delay={0.05}>
                <section className="desk-rail-card" aria-labelledby="desk-loop-title">
                  <div className="desk-rail-head">
                    <h3 id="desk-loop-title" className="desk-rail-title">The loop</h3>
                    <span className="desk-mono">Stage {loopStage} of 6</span>
                  </div>
                  <div className="desk-loop">
                    {LOOP_STAGES.map((s,i)=>(
                      <span key={s} className={`desk-loop-stage ${i<(loop?.stageIndex??0)?"is-done":i===(loop?.stageIndex??0)?"is-now":""}`}>
                        {s}
                      </span>
                    ))}
                  </div>
                  <LoopBody loop={loop} />
                </section>
              </Reveal>

              <Reveal delay={0.04}>
                <section className="desk-rail-card" id="growth" aria-labelledby="desk-growth-title">
                  <div className="desk-rail-head">
                    <h3 id="desk-growth-title" className="desk-rail-title">Your last 30 days</h3>
                  </div>
                  {snapshot ? (
                    <>
                      <div className="desk-growth-grid">
                        <DeskStat value={`${Number(snapshot.consistency_score||0)}%`} label="days active" />
                        <DeskStat value={`${Number(snapshot.roadmap_completion_pct||0)}%`} label="roadmap" />
                        <DeskStat value={snapshot.total_commits??0} label="commits" />
                      </div>
                      <p className="desk-rail-sub">{peers?.n>0 ? `Avg consistency ${Number(peers.ac||0)}% across ${peers.n} peers` : "Peer comparison appears once the chapter has snapshots."}</p>
                    </>
                  ) : (
                    <div className="mt-3">
                      <p className="text-sm font-medium" style={{ color:"var(--desk-ink)" }}>Numbers arrive after motion.</p>
                      <p className="desk-rail-sub">Connect GitHub and finish your first node - then this becomes your growth story.</p>
                      <Link href="/student/github" prefetch={false} className="desk-inline-link mt-3 inline-block text-xs">Connect GitHub &rarr;</Link>
                    </div>
                  )}
                </section>
              </Reveal>
            </aside>
          </div>
        </>
      )}

      <section className="desk-section desk-community" aria-labelledby="desk-community-title">
        <div className="desk-section-head">
          <span className="desk-index">06</span>
          <h2 id="desk-community-title">Community &amp; growth</h2>
          <span className="desk-note">Where learning turns social</span>
        </div>
        <p className="desk-section-lede">Departments, volunteering, and the chapter feed - the people around the work.</p>
        <div className="mt-5"><DepartmentsSection /></div>
      </section>

      <Reveal>
        <section className="desk-coda" aria-labelledby="desk-coda-title">
          <span className="desk-coda-shader" aria-hidden="true" />
          <p className="desk-label">Keep building</p>
          <h2 id="desk-coda-title" className="desk-coda-title">Keep building, {name}.</h2>
          <p className="desk-coda-body">Progress becomes proof when learning turns into projects, contributions, and community.</p>
          <div className="mt-6 flex justify-center">
            <Link href="/student/roadmap" prefetch={false} className="btn-ink !px-7 !py-3 !text-base">Continue roadmap &rarr;</Link>
          </div>
        </section>
      </Reveal>
    </main>
  );
}

function DeskStat({ value, label }) {
  return (
    <span className="desk-growth-stat">
      <span className="desk-growth-value">{value}</span>
      <span className="desk-growth-label">{label}</span>
    </span>
  );
}

function LoopBody({ loop }) {
  if (!loop) return null;
  if (loop.isMentor) return <p className="desk-rail-sub">You close the loop. Juniors are waiting - <Link href="/student/mentorship" prefetch={false} className="desk-inline-link">guide the next intake</Link>.</p>;
  if (loop.applicationStatus==="pending") return <p className="desk-rail-sub">Your mentor application is <strong style={{ color:"var(--desk-thread)" }}>under review</strong>.</p>;
  if (loop.eligible) return <div className="mt-3"><p className="desk-rail-sub">Your proof qualifies you to guide juniors - <strong style={{ color:"var(--desk-ink)" }}>you&apos;re ready to mentor.</strong></p><Link href="/student/mentorship" prefetch={false} className="btn-ink mt-3 inline-block !py-2 text-sm">Become a mentor &rarr;</Link></div>;
  return <p className="desk-rail-sub">Mentor candidacy needs {loop.stats?`${Math.max(0,Math.round(40-loop.stats.pct))}% more path`:"progress"}{loop.stats?.proof===0?" plus one public contribution":""}. Fastest honest route: answer a stuck peer.</p>;
}
