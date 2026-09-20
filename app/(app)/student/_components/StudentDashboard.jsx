"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Display, Meta, ActionLink, StatusPill } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import { DepartmentsSection } from "@/components/student/OrgPanels";

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

export function StudentDashboard({
  profile, greeting, todayLabel, nextNode, nodes, doneIds, overallPercent,
  nextMilestone, weekDays, weekCounts, contests, events, sessions, proof, snapshot, peers,
  loop, cadence, notificationsPreview, notifUnread, projectsPreview, projectCount,
  achievementsPreview, achievementCount, credentialCount
}) {
  const name = profile?.name?.split(" ")[0] || "there";
  const done = new Set(doneIds);
  const fresh = !profile?.primary_domain || doneIds.length === 0;
  const stops = nodes.map((n) => ({
    label: n.title,
    state: done.has(n.id) ? "done" : nextNode && n.id === nextNode.id ? "now" : "todo"
  }));
  const remaining = nodes.length - doneIds.length;
  const domainLabel = nextNode?.domain ? nextNode.domain.replace(/_/g, " ").replace(/\b\w/g, c=>c.toUpperCase()) : "Roadmap";

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* HERO — inside environment, not a card. Clipped gradient field */}
      <Reveal>
        <section className="hero-field -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-10 sm:pt-8 sm:pb-14" aria-label="Where you are">
          <p className="meta">{greeting.toUpperCase()}, {name.toUpperCase()}</p>
          {nextNode ? (
            <>
              <p className="narrative mt-3 max-w-2xl" style={{ color: "var(--text-muted)" }}>
                You are <strong style={{ color: "var(--text)" }}>{remaining === 1 ? "1 step" : `${remaining} steps`} away</strong> from completing your next {domainLabel} milestone.
              </p>
              <h1 className="display display-lg mt-4 max-w-3xl">{nextNode.title}</h1>
              <p className="meta mt-3">{nextNode.domain ? `${nextNode.domain.replace(/_/g, " ")} · ` : ""}Roadmap · {nextNode.difficulty_level || "Milestone"}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/student/roadmap/${nextNode.id}`} prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Continue →</Link>
                <Link href="/student/roadmap" prefetch={false} className="btn-ghost !px-6 !py-3 !text-base">View roadmap</Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="display display-lg mt-4 max-w-3xl">The whole path, walked.</h1>
              <p className="narrative mt-3 max-w-2xl">Every milestone complete — {doneIds.length} of {nodes.length}. Turn momentum into public proof.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/student/credentials" prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Share proof →</Link>
                <Link href="/student/opensource" prefetch={false} className="btn-ghost !px-6 !py-3 !text-base">Find an OSS issue</Link>
              </div>
            </>
          )}
          <p className="meta mt-6">{todayLabel} · {overallPercent}% complete · {doneIds.length} of {nodes.length} milestones</p>
          <div className="mt-3 h-1.5 max-w-xl overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
            <div className="h-full rounded-full" style={{ width: `${overallPercent}%`, background: "linear-gradient(90deg,var(--thread-cyan),var(--thread-gold))" }} />
          </div>
        </section>
      </Reveal>

      {fresh ? (
        <Reveal delay={0.06}>
          <section className="mt-2">
            <OnboardingState
              eyebrow="Your first week"
              title="Three small steps unlock everything."
              why="L.O.O.M. reads your real activity — roadmap progress, commits, shipped projects — and turns it into proof."
              steps={[
                { title: "Set your direction", body: "Pick a track in onboarding so recommendations point correctly." },
                { title: "Finish your first node", body: "Open the roadmap and complete milestone one. The next unlocks itself." },
                { title: "Connect GitHub", body: "Real commits become growth evidence, automatically." }
              ]}
              action={<Link href="/student/roadmap" prefetch={false} className="btn-ink">Open your roadmap →</Link>}
            />
          </section>
        </Reveal>
      ) : (
        <>
          {/* WEEK — open strip, no card */}
          <Reveal delay={0.04}>
            <section className="mt-4 border-y py-6 sm:py-8" style={{ borderColor: "var(--line)" }} aria-label="This week">
              <div className="flex items-baseline justify-between gap-3">
                <Meta>This week</Meta>
                <span className="meta">{weekCounts.sessions} sessions · {weekCounts.contributions} contributions · {weekCounts.milestones} milestones</span>
              </div>
              <div className="weekstrip mt-4">
                {weekDays.map((d) => (
                  <div key={d.label} className={`weekday ${d.hit ? "is-hit" : ""} ${d.today ? "is-today" : ""}`}>
                    <span className="meta text-[10px] leading-none">{d.label.slice(0,3).toUpperCase()}</span>
                    <span className="weekpip" aria-label={`${d.label} ${d.hit ? "active" : "quiet"}${d.today ? " today" : ""}`}>
                      <span className="size-1.5 rounded-full" style={{ background: d.hit ? "var(--accent)" : d.today ? "var(--line)" : "transparent", display: d.hit || d.today ? "block" : "none" }} />
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>

          {/* JOURNEY — horizontal path, open space */}
          <Reveal delay={0.05}>
            <section className="mt-8 sm:mt-10" aria-label="Your journey">
              <div className="flex items-baseline justify-between gap-3">
                <Meta>Your journey</Meta>
                <span className="meta">{doneIds.length} of {nodes.length} · {overallPercent}%</span>
              </div>
              <div className="mt-6">
                <div className="journey">
                  <div className="journey-track"><div className="journey-fill" style={{ width: `${overallPercent}%` }} /></div>
                  <div className="journey-stops" style={{ height: 18 }}>
                    {stops.map((s,i) => {
                      const left = stops.length===1 ? 100 : (i/(stops.length-1))*100;
                      return (
                        <div key={i} className={`journey-stop ${s.state==="done"?"is-done":s.state==="now"?"is-now":""}`} style={{ left: `${left}%` }}>
                          <span className="journey-pip" aria-hidden="true" />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color:"var(--text-muted)" }}>
                  {stops.slice(0,5).map((s,i) => (
                    <span key={i} style={{ color: s.state==="now" ? "var(--accent)" : s.state==="done" ? "var(--text)" : "var(--text-muted)", fontWeight: s.state==="now" ? 700 : 400 }}>
                      {s.state==="now" ? `● ${s.label} — you are here` : s.label}
                    </span>
                  ))}
                  {stops.length>5 && <span>· +{stops.length-5} more</span>}
                </div>
              </div>
              <div className="mt-4">
                <ActionLink href="/student/roadmap">Open the path →</ActionLink>
              </div>
            </section>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.7fr_1fr] lg:gap-12">
            {/* LEFT — evidence stream + coming up rail */}
            <div className="min-w-0 space-y-10">
              <Reveal delay={0.04}>
                <section aria-label="Recent proof">
                  <Meta>Recent proof</Meta>
                  <p className="narrative mt-1">What you actually did — not what you planned.</p>
                  {proof.length>0 ? (
                    <ol className="tl mt-5">
                      {proof.map((p,i) => (
                        <li key={i} className={`tl-item ${p.hot ? "is-done" : ""}`}>
                          <span className="tl-dot" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-6" style={{ color:"var(--text)" }}>{p.text}</p>
                            <p className="meta mt-0.5">{p.meta}</p>
                            {p.href && <Link href={p.href} prefetch={false} className="mt-1 inline-block text-xs font-semibold hover:underline" style={{ color:"var(--accent)" }}>View →</Link>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="narrative mt-4">Nothing recorded yet. Finish a node or ship a project — it will appear here with evidence attached.</p>
                  )}
                  <div className="mt-4">
                    <ActionLink href="/student/credentials">Open proof →</ActionLink>
                  </div>
                </section>
              </Reveal>

              <Reveal delay={0.05}>
                <section aria-label="Coming up">
                  <Meta>Coming up</Meta>
                  <p className="narrative mt-1">What the chapter has put on the horizon.</p>
                  <ul className="mt-4 divide-y" style={{ borderColor:"var(--line)" }}>
                    {(() => {
                      const rows = [
                        ...(sessions||[]).map(s=>({ when: relDay(s.scheduled_at), title: s.mentor_name?`Mentor session with ${s.mentor_name}`:"Mentor session", sub: s.expertise||"mentorship", href:"/student/mentorship" })),
                        ...(contests||[]).map(c=>({ when: relDay(c.ends_at||c.starts_at), title: c.title, sub: c.registered?"registered · contest":"contest — registration open", href:"/student/contests" })),
                        ...(events||[]).map(e=>({ when: relDay(e.starts_at), title: e.title, sub: `${e.event_type||"event"}${e.is_online?" · online":e.location?` · ${e.location}`:""}`, href:"/student/events" }))
                      ].slice(0,5);
                      if (!rows.length) return <li className="py-3 text-sm" style={{ color:"var(--text-muted)" }}>Nothing scheduled. <Link href="/student/contests" style={{ color:"var(--accent)" }} className="font-semibold hover:underline">Browse challenges</Link> or <Link href="/student/events" style={{ color:"var(--accent)" }} className="font-semibold hover:underline">find an event</Link>.</li>;
                      return rows.map((r,i)=>(
                        <li key={i} className="flex items-center gap-3 py-3">
                          <span className="meta w-24 shrink-0">{r.when.toUpperCase()}</span>
                          <span className="min-w-0 flex-1">
                            <Link href={r.href} prefetch={false} className="block truncate text-sm font-semibold hover:underline" style={{ color:"var(--text)" }}>{r.title}</Link>
                            <span className="meta block truncate">{r.sub}</span>
                          </span>
                        </li>
                      ));
                    })()}
                  </ul>
                </section>
              </Reveal>

              {/* BUILDING — editorial featured + list */}
              <Reveal delay={0.04}>
                <section aria-label="Things you are building">
                  <div className="flex items-baseline justify-between gap-3">
                    <Meta>Things you are building</Meta>
                    <span className="meta">{projectCount ?? 0} shipped</span>
                  </div>
                  {projectsPreview && projectsPreview.length>0 ? (
                    <>
                      <Link href={`/student/projects/${projectsPreview[0].id}`} prefetch={false} className="mt-4 block rounded-2xl border p-5 sm:p-6 hover:shadow-sm" style={{ borderColor:"var(--line)", background:"var(--bg-elevated)" }}>
                        <span className="pill is-live">{projectsPreview[0].status}</span>
                        <p className="display display-md mt-3" style={{ overflowWrap:"break-word" }}>{projectsPreview[0].title}</p>
                        {projectsPreview[0].description && <p className="narrative mt-2">{projectsPreview[0].description}</p>}
                        <span className="meta mt-3 block" style={{ color:"var(--accent)" }}>Open →</span>
                      </Link>
                      {projectsPreview.length>1 && (
                        <ul className="mt-3 space-y-2">
                          {projectsPreview.slice(1,3).map((p,i)=>(
                            <li key={p.id} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor:"var(--line)", background:"var(--bg-elevated)" }}>
                              <span className="index-num hidden sm:block">{String(i+2).padStart(2,"0")}</span>
                              <Link href={`/student/projects/${p.id}`} prefetch={false} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" style={{ color:"var(--text)" }}>{p.title}</Link>
                              <span className="meta shrink-0 hidden sm:block">{p.status}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border p-6" style={{ borderColor:"var(--line)", background:"var(--bg-elevated)" }}>
                      <p className="text-sm font-semibold" style={{ color:"var(--text)" }}>Ship your first build.</p>
                      <p className="narrative mt-2">Projects turn learning into proof — they feed your profile, credentials, and reports.</p>
                      <Link href="/student/projects/new" prefetch={false} className="btn-ink mt-4 inline-block">Create project →</Link>
                    </div>
                  )}
                  <div className="mt-3">
                    <ActionLink href="/student/projects">All projects →</ActionLink>
                  </div>
                </section>
              </Reveal>
            </div>

            {/* RIGHT — live rail: inbox + rhythm + loop + growth */}
            <aside className="min-w-0 space-y-8" aria-label="Live">
              <Reveal delay={0.04}>
                <section>
                  <div className="flex items-baseline justify-between gap-2">
                    <Meta>Inbox</Meta>
                    {notifUnread>0 ? <span className="meta" style={{ color:"var(--accent)" }}>{notifUnread} unread</span> : <ActionLink href="/student/notifications">History</ActionLink>}
                  </div>
                  {notificationsPreview && notificationsPreview.length>0 ? (
                    <ul className="mt-3 divide-y" style={{ borderColor:"var(--line)" }}>
                      {notificationsPreview.slice(0,5).map(n=>(
                        <li key={n.id} className="flex gap-2.5 py-2.5">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: n.read_at?"var(--line)":"var(--accent)" }} aria-hidden="true" />
                          <Link href={n.link||"/student/notifications"} prefetch={false} className="min-w-0">
                            <span className="block truncate text-sm font-medium" style={{ color:"var(--text)" }}>{n.title}</span>
                            {n.body && <span className="block truncate text-xs" style={{ color:"var(--text-muted)" }}>{n.body}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="narrative mt-3 text-sm">All caught up. Mentions and chapter news land here.</p>
                  )}
                </section>
              </Reveal>

              <div className="rule" aria-hidden="true" />

              <Reveal delay={0.05}>
                <section aria-label="Chapter rhythm">
                  <Meta>Chapter rhythm</Meta>
                  <p className="narrative mt-1 text-sm">Year-round, not once a semester.</p>
                  <ul className="mt-3 space-y-2">
                    {[
                      [cadence?.workshop?`${cadence.workshop.title} · ${relShort(cadence.workshop.when)}`:"no workshop — propose one","Workshops","/student/events"],
                      [`${cadence?.contests??0} open`, "Challenges","/student/contests"],
                      [`${cadence?.mentors??0} guides`, "Mentors","/student/mentorship"],
                      [`${cadence?.projects??0} shipped`, "Projects","/student/projects"],
                      [`${cadence?.oss??0} repos`, "OSS","/student/opensource"]
                    ].map(([detail,label,href],i)=>(
                      <li key={i} className="flex items-baseline justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor:"var(--line)", background:"var(--bg-elevated)" }}>
                        <span className="meta">{label}</span>
                        <span className="truncate text-xs font-semibold" style={{ color:"var(--text)" }}>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </Reveal>

              <div className="rule" aria-hidden="true" />

              <Reveal delay={0.05}>
                <section aria-label="The loop">
                  <Meta>Stage {Math.min((loop?.stageIndex??0)+1,6)} of 6 — {LOOP_STAGES[Math.min(loop?.stageIndex??0,5)]}</Meta>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {LOOP_STAGES.map((s,i)=>(
                      <span key={s} className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={i<(loop?.stageIndex??0)?{background:"var(--accent)",borderColor:"var(--accent)",color:"#101314"}:i===(loop?.stageIndex??0)?{borderColor:"var(--accent)",color:"var(--accent)"}:{borderColor:"var(--line)",color:"var(--text-muted)"}}>
                        {s}
                      </span>
                    ))}
                  </div>
                  <LoopBody loop={loop} />
                </section>
              </Reveal>

              <div className="rule" aria-hidden="true" />

              <Reveal delay={0.04}>
                <section id="growth" className="scroll-mt-20" aria-label="Your growth">
                  <Meta>Your last 30 days</Meta>
                  {snapshot ? (
                    <>
                      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-4">
                        <PlainStat value={`${Number(snapshot.consistency_score||0)}%`} label="days active" />
                        <PlainStat value={`${Number(snapshot.roadmap_completion_pct||0)}%`} label="roadmap" />
                        <PlainStat value={snapshot.total_commits??0} label="commits" />
                      </div>
                      <p className="meta mt-3">{peers?.n>0 ? `Avg consistency ${Number(peers.ac||0)}% across ${peers.n} peers` : "Peer comparison appears once the chapter has snapshots."}</p>
                    </>
                  ) : (
                    <div className="mt-3">
                      <p className="text-sm font-medium" style={{ color:"var(--text)" }}>Numbers arrive after motion.</p>
                      <p className="narrative mt-1 text-sm">Connect GitHub and finish your first node — then this becomes your growth story.</p>
                      <Link href="/student/github" prefetch={false} className="mt-3 inline-block text-xs font-semibold hover:underline" style={{ color:"var(--accent)" }}>Connect GitHub →</Link>
                    </div>
                  )}
                </section>
              </Reveal>
            </aside>
          </div>
        </>
      )}

      <section className="mt-12 border-t pt-8" style={{ borderColor:"var(--line)" }} aria-label="Community and growth">
        <Meta>Community &amp; growth</Meta>
        <p className="narrative mt-1">Departments, volunteering, and the chapter feed — where learning turns social.</p>
        <div className="mt-6"><DepartmentsSection /></div>
      </section>

      <Reveal>
        <section className="hero-field mt-12 rounded-3xl border px-6 py-10 text-center sm:px-10" style={{ borderColor:"var(--line)", background:"var(--bg-elevated)" }}>
          <Meta>Keep building</Meta>
          <p className="display display-md mx-auto mt-3">Keep building, {name}.</p>
          <p className="narrative mx-auto mt-2 text-center">Progress becomes proof when learning turns into projects, contributions, and community.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/student/roadmap" prefetch={false} className="btn-ink !px-6 !py-3 !text-base">Continue roadmap →</Link>
            <Link href="/student/projects" prefetch={false} className="btn-ghost !px-6 !py-3 !text-base">Explore projects</Link>
          </div>
        </section>
      </Reveal>
    </main>
  );
}

function PlainStat({ value, label }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="figure text-xl">{value}</span>
      <span className="meta">{label}</span>
    </span>
  );
}
function LoopBody({ loop }) {
  if (!loop) return null;
  if (loop.isMentor) return <p className="narrative mt-3 text-sm">You close the loop. Juniors are waiting — <Link href="/student/mentorship" className="font-semibold hover:underline" style={{ color:"var(--accent)" }}>guide the next intake</Link>.</p>;
  if (loop.applicationStatus==="pending") return <p className="narrative mt-3 text-sm">Your mentor application is <strong style={{ color:"var(--accent)" }}>under review</strong>.</p>;
  if (loop.eligible) return <div className="mt-3"><p className="narrative text-sm">Your proof qualifies you to guide juniors — <strong style={{ color:"var(--text)" }}>you&apos;re ready to mentor.</strong></p><Link href="/student/mentorship" prefetch={false} className="btn-ink mt-3 inline-block !py-2 text-sm">Become a mentor →</Link></div>;
  return <p className="narrative mt-3 text-sm">Mentor candidacy needs {loop.stats?`${Math.max(0,Math.round(40-loop.stats.pct))}% more path`:"progress"}{loop.stats?.proof===0?" plus one public contribution":""}. Fastest honest route: answer a stuck peer.</p>;
}
