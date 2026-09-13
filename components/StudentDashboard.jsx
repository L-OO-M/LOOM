"use client";

import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useTab } from "@/components/AppShell";
import { BookOpen, GitPullRequest, Trophy, Code, Layers, ExternalLink } from "lucide-react";

export function StudentDashboard({ profile, nodes, doneIds, doneCount, totalCount, overallPercent, activity, resources, domainAvg = {} }) {
  const { activeTab } = useTab();
  const done = new Set(doneIds);
  const TRACKS = ["ai_ml", "web", "cybersecurity", "dsa", "blockchain"];
  const radar = TRACKS.map((d) => {
    const ns = nodes.filter((n) => n.domain === d);
    const pct = ns.length ? Math.round((ns.filter((n) => done.has(n.id)).length / ns.length) * 100) : 0;
    return { domain: d, pct, avg: Math.round(Number(domainAvg[d] || 0)) };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <AnimatePresence mode="wait">
        {activeTab === "dashboard" && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <div className="card-sheen relative overflow-hidden rounded-2xl border p-7" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <span className="ghost-type -right-2 -top-7 text-[7rem]" aria-hidden="true">{overallPercent}%</span>
                <p style={{ color: "var(--text-muted)" }} className="relative text-xs">
                  {profile ? `Welcome back, ${profile.name}` : "Welcome to L.O.O.M."}
                </p>
                <h1 className="relative mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>
                  {profile?.primary_domain ? `${profile.primary_domain} — active` : "Connect your GitHub"}
                </h1>
                <div className="rule-gold relative mt-4 w-20" />
                <p className="relative mt-3 max-w-lg text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  Complete nodes and ship code. Each milestone unlocks the next.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <MiniStat icon={GitPullRequest} label="Today commits" value={activity?.[0]?.commits ?? 0} />
                  <MiniStat icon={BookOpen} label="Streak" value={activity?.[0]?.day?.slice(5) ?? "—"} />
                  <MiniStat icon={Trophy} label="Progress" value={`${overallPercent}%`} />
                </div>
              </div>
              <div className="flex flex-col items-center justify-center rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <ProgressCircle value={overallPercent} />
                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>{profile?.primary_domain ?? "No domain"}</p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border p-6 sm:p-7" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="kicker">Skill radar</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                    Where you stand, per track
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    Solid line is you · dashed is your chapter average.
                  </p>
                </div>
                <Link href="/student/insights" className="text-sm font-medium" style={{ color: "var(--accent)" }}>Full insights →</Link>
              </div>
              <SkillRadar radar={radar} />
              <div className="mt-2 flex flex-wrap gap-4">
                <Link href="/student/credentials" className="text-sm font-medium" style={{ color: "var(--accent)" }}>Share proof →</Link>
                <Link href="/student/discover" className="text-sm font-medium" style={{ color: "var(--accent)" }}>Find people →</Link>
              </div>
            </div>
            {(!profile?.primary_domain || doneCount === 0) && (
              <div className="mt-6 rounded-2xl border p-6 sm:p-7" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
                <p className="kicker">Start here</p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                  Your first week on L.O.O.M.
                </h2>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  Five small steps. Each one unlocks the next part of the platform.
                </p>
                <ol className="mt-5 space-y-2">
                  <StartStep n={1} title="Set your direction" body="Pick a track in onboarding so recommendations know where to point." href="/student/onboarding" cta="Choose track" done={!!profile?.primary_domain} />
                  <StartStep n={2} title="Complete your first roadmap node" body="Open your path and finish the first milestone." href="/student/roadmap" cta="Open roadmap" done={doneCount > 0} />
                  <StartStep n={3} title="Learn from a curated resource" body="Five tracks — AI/ML, Web, Cybersecurity, DSA, Blockchain." href="/student/resources" cta="Browse tracks" done={false} />
                  <StartStep n={4} title="Ship your first project" body="Proof beats progress. Publish something small this week." href="/student/projects/new" cta="Create project" done={false} />
                  <StartStep n={5} title="Connect GitHub" body="Real commits become your growth evidence, automatically." href="/student/github" cta="Connect" done={(activity?.[0]?.commits ?? 0) > 0} />
                </ol>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "roadmap" && (
          <motion.div key="roadmap" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <h2 className="mb-5 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>Your roadmap</h2>
            <div className="space-y-2">
              {nodes.map((node, i) => {
                const completed = doneIds.includes(node.id);
                const active = i === doneCount;
                return (
                  <div
                    key={node.id}
                    className="flex items-center gap-4 rounded-xl border p-4 transition"
                    style={{
                      borderColor: completed ? "var(--accent)" : active ? "var(--accent)" : "var(--line)",
                      background: completed ? "color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))" : "var(--bg-elevated)",
                      boxShadow: active ? "0 0 0 1px var(--accent)" : "none",
                      opacity: completed || active || i <= doneCount + 2 ? 1 : 0.4
                    }}
                  >
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                      style={{
                        background: completed ? "var(--text)" : "var(--bg-muted)",
                        color: completed ? "var(--bg)" : "var(--text-muted)"
                      }}
                    >
                      {completed ? "✓" : i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{node.title}</p>
                      <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                        {node.description}{node.difficulty_level ? ` · ${node.difficulty_level}` : ""}
                      </p>
                    </div>
                    {active && <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: "var(--text)", color: "var(--bg)" }}>Active</span>}
                    {completed && <span className="shrink-0 text-xs" style={{ color: "var(--accent)" }}>Done</span>}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === "resources" && (
          <motion.div key="resources" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <h2 className="mb-5 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>Resources</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resources.map((r) => (
                <div key={r.id} className="rounded-xl border p-5 transition hover:opacity-80" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <Layers size={18} style={{ color: "var(--accent)" }} strokeWidth={1.5} />
                  <p className="mt-3 text-sm font-medium" style={{ color: "var(--text)" }}>{r.title}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{r.minutes} min · {r.level?.replace("_", " ")}</p>
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
                      Open <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "github" && (
          <motion.div key="github" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <h2 className="mb-5 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>GitHub activity</h2>
            <div className="rounded-2xl border p-7" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl p-5" style={{ background: "var(--bg-muted)" }}>
                  <Code size={18} style={{ color: "var(--accent)" }} strokeWidth={1.5} />
                  <p className="mt-3 font-mono text-2xl font-semibold" style={{ color: "var(--text)" }}>{activity?.[0]?.commits ?? 0}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Today commits</p>
                </div>
                <div className="rounded-xl p-5" style={{ background: "var(--bg-muted)" }}>
                  <GitPullRequest size={18} style={{ color: "var(--accent)" }} strokeWidth={1.5} />
                  <p className="mt-3 font-mono text-2xl font-semibold" style={{ color: "var(--text)" }}>{activity?.[0]?.pull_requests ?? 0}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Pull requests</p>
                </div>
                <div className="rounded-xl p-5" style={{ background: "var(--bg-muted)" }}>
                  <BookOpen size={18} style={{ color: "var(--accent)" }} strokeWidth={1.5} />
                  <p className="mt-3 font-mono text-2xl font-semibold" style={{ color: "var(--text)" }}>{activity?.[0]?.reviews ?? 0}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Reviews</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function StartStep({ n, title, body, href, cta, done }) {
  return (
    <li
      className="flex items-center gap-4 rounded-xl border p-4"
      style={{ borderColor: done ? "var(--accent)" : "var(--line)", background: done ? "color-mix(in srgb, var(--accent) 7%, var(--bg-elevated))" : "transparent" }}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
        style={done ? { background: "var(--text)", color: "var(--bg)" } : { background: "var(--bg-muted)", color: "var(--text-muted)" }}
      >
        {done ? "✓" : n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium" style={{ color: "var(--text)" }}>{title}</span>
        <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>{body}</span>
      </span>
      {done ? (
        <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--accent)" }}>Done</span>
      ) : (
        <a href={href} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-85 active:scale-[0.97]" style={{ background: "var(--text)", color: "var(--bg)" }}>
          {cta}
        </a>
      )}
    </li>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {Icon && <Icon size={14} strokeWidth={1.5} />}
        {label}
      </div>
      <p className="mt-1 font-mono text-lg font-semibold" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}

function SkillRadar({ radar }) {
  const size = 220;
  const c = size / 2;
  const R = 78;
  const pt = (i, v) => {
    const a = (Math.PI * 2 * i) / radar.length - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, v)) / 100) * R;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const poly = (key) => radar.map((d, i) => pt(i, d[key]).join(",")).join(" ");
  const short = { ai_ml: "AI/ML", web: "Web", cybersecurity: "Cyber", dsa: "DSA", blockchain: "Chain" };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto mt-4 max-w-70" role="img" aria-label="Skill radar by track">
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={radar.map((_, i) => pt(i, v).join(",")).join(" ")} fill="none" stroke="var(--line)" strokeWidth="1" />
      ))}
      {radar.map((d, i) => {
        const [x, y] = pt(i, 118);
        return <text key={d.domain} x={x} y={y} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{short[d.domain] || d.domain} {d.pct}%</text>;
      })}
      <polygon points={poly("avg")} fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
      <polygon points={poly("pct")} fill="color-mix(in srgb, var(--accent) 18%, transparent)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {radar.map((d, i) => {
        const [x, y] = pt(i, d.pct);
        return <circle key={d.domain} cx={x} cy={y} r="3" fill="var(--accent)" />;
      })}
    </svg>
  );
}

function ProgressCircle({ value }) {  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--bg-muted)" strokeWidth="5" />
      <circle
        cx="60" cy="60" r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 0.6s var(--ease-out)" }}
      />
      <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text)">
        {value}%
      </text>
      <text x="60" y="76" textAnchor="middle" fontSize="10" fill="var(--text-muted)">
        overall
      </text>
    </svg>
  );
}