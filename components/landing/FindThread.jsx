"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const PATHS = {
  learn: {
    label: "I want to learn",
    title: "Your thread begins with foundations.",
    steps: [
      ["Start onboarding", "Zero-barrier entry into the ecosystem.", "/student/onboarding"],
      ["Follow a roadmap", "Milestones, not endless links.", "/student/roadmap"],
      ["Read the curated shelf", "Mentor-picked resources for your track.", "/student/resources"]
    ]
  },
  build: {
    label: "I want to build",
    title: "Your thread begins with shipping.",
    steps: [
      ["Join a project team", "Build in teams, ship every semester.", "/student/projects"],
      ["Sharpen with contests", "Weekly practice that compounds.", "/student/contests"],
      ["Show your work", "Demo days turn effort into evidence.", "/student/showcases"]
    ]
  },
  contribute: {
    label: "I want to contribute",
    title: "Your thread begins in public.",
    steps: [
      ["Enter the OSS portal", "Curated repos that welcome beginners.", "/student/opensource"],
      ["Link your GitHub", "Your merges become your proof.", "/student/github"],
      ["Sprint and merge", "Hackathons and OSS sprints, year-round.", "/student/contests"]
    ]
  },
  mentor: {
    label: "I want to mentor",
    title: "Your thread begins by giving back.",
    steps: [
      ["See the mentor path", "How members become mentors.", "/student/mentorship"],
      ["Prove with merges", "Public proof comes first.", "/student/opensource"],
      ["Guide the next intake", "Close the loop you once entered.", "/student/mentorship"]
    ]
  },
  opportunities: {
    label: "I want opportunities",
    title: "Your thread begins with exposure.",
    steps: [
      ["Catch the calendar", "Talks, sprints, hackathons.", "/student/events"],
      ["Find your crew", "Teams, mentors, and collaborators.", "/student/community"],
      ["Build the proof", "Opportunities follow evidence.", "/student/projects"]
    ]
  }
};

/* "Find your thread": a tiny onboarding ritual. Pick what brings you here;
   LOOM answers with a personal path of real places inside the platform.
   No data collected — it is a compass, not a form. */
export function FindThread() {
  const [choice, setChoice] = useState(null);
  const path = choice ? PATHS[choice] : null;
  return (
    <div className="mt-10 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex flex-wrap gap-2 p-6 sm:p-7" role="group" aria-label="What brings you here?">
        {Object.entries(PATHS).map(([key, p]) => (
          <button key={key} type="button" onClick={() => setChoice(key)} aria-pressed={choice === key}
            className="rounded-full border px-4 py-2 text-sm font-semibold transition active:scale-95"
            style={choice === key
              ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314" }
              : { borderColor: "var(--line)", color: "var(--text)" }}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="border-t px-6 py-6 sm:px-7" style={{ borderColor: "var(--line)" }} aria-live="polite">
        {!path ? (
          <p className="max-w-xl leading-7" style={{ color: "var(--text-muted)" }}>
            What brings you here? Choose above — your thread begins with a path built for exactly that.
          </p>
        ) : (
          <div>
            <h3 className="font-display text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>{path.title}</h3>
            <ol className="mt-5 space-y-3">
              {path.steps.map(([title, body, href], i) => (
                <li key={title}>
                  <Link href={href} className="group flex items-center gap-4 rounded-xl border p-4 transition hover:-translate-y-0.5"
                    style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold"
                      style={{ borderColor: "var(--accent)", color: "var(--text)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold" style={{ color: "var(--text)" }}>{title}</span>
                      <span className="block truncate text-sm" style={{ color: "var(--text-muted)" }}>{body}</span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 transition group-hover:translate-x-1" style={{ color: "var(--accent)" }} />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
