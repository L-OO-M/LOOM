"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ITEMS = [
  { title: "Beginner Workshops", sub: "Onboarding", href: "/student/onboarding", body: "Zero-barrier entry. Prior experience is never a prerequisite.", detail: "First-week friendly sessions that take you from zero to your first commit. Bring questions; leave with momentum." },
  { title: "Weekly DSA & Problem-Solving", sub: "Habit-building", href: "/student/contests", body: "Small, steady, every week. Streaks are a side effect, not the goal.", detail: "One sitting a week, same time, same crew. Difficulty ramps with you — scoreboards never punish beginners." },
  { title: "Peer-to-Peer Mentorship", sub: "Continuous support", href: "/student/mentorship", body: "Guidance from seniors who remember the first step.", detail: "Matched by track and level, with check-ins that fit around classes — not the other way round." },
  { title: "Mini-projects & Showcases", sub: "Applied learning", href: "/student/projects", body: "Ship small, ship often. Proof beats progress.", detail: "Small teams, short cycles, demo days. Everything you build becomes portfolio evidence." },
  { title: "Tech Talks", sub: "Industry exposure", href: "/student/events", body: "Practitioners, not influencers. Real work, shown honestly.", detail: "Engineers walk through real systems and real mistakes. No keynotes about keynotes." },
  { title: "Hackathons & OSS Sprints", sub: "External contribution", href: "/student/opensource", body: "Break out of the classroom and merge into the real world.", detail: "Time-boxed sprints against curated beginner-friendly repos. Merges count toward your public proof." }
];

/* The calendar as a timeline: one spine, dated by rhythm rather than
   date-stamped (no invented schedules). Each stop expands in place. */
export function CadenceTimeline() {
  return (
    <ol className="relative mt-12">
      <span aria-hidden="true" className="absolute bottom-4 left-[7px] top-2 w-px sm:left-[9px]"
        style={{ background: "linear-gradient(to bottom, var(--accent), rgba(242,243,241,0.15))" }} />
      {ITEMS.map((c, i) => (
        <li key={c.title} className="scroll-reveal relative pb-3 pl-9 last:pb-0 sm:pl-12">
          <span aria-hidden="true" className="absolute left-0 top-1.5 grid size-4 place-items-center rounded-full border sm:size-5"
            style={{ borderColor: "var(--accent)", background: "#101314" }}>
            <span className="size-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          </span>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            Rhythm {String(i + 1).padStart(2, "0")} · {c.sub}
          </p>
          <details className="cadence-details group mt-1">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 outline-none focus-visible:underline [&::-webkit-details-marker]:hidden">
              <span className="font-display text-2xl font-medium sm:text-3xl" style={{ color: "#f2f3f1" }}>{c.title}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] transition group-open:rotate-90" style={{ color: "var(--accent)" }} aria-hidden="true">
                + details
              </span>
            </summary>
            <div className="mt-3 max-w-2xl">
              <p className="text-sm leading-6" style={{ color: "rgba(242,243,241,0.7)" }}>{c.detail}</p>
              <Link href={c.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold transition hover:gap-2" style={{ color: "var(--accent)" }}>
                See it live <ArrowRight size={14} />
              </Link>
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}
