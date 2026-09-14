"use client";

import { useState } from "react";

const LETTERS = [
  { letter: "L", name: "Learning", color: "#3fd2e0", body: "Structured beginner guidance — knowledge with a path, not a pile of links." },
  { letter: "O", name: "Opportunity", color: "#e8a83e", body: "Projects, competitions, talks, exposure. Learning unlocks the door." },
  { letter: "O", name: "Open Source", color: "#e86a5e", body: "Public contribution beyond the classroom. Exposure becomes proof." },
  { letter: "M", name: "Mentorship", color: "#8fa8c8", body: "Seniors guide juniors — until juniors become mentors. The loop closes." }
];

/* Hero letter-nodes: each pillar letter is a node on a thread. Hover or
   focus extends its thread and names the promise; click pins it. Links
   onward to the full constellation at #pillars. */
export function LoomLetters() {
  const [active, setActive] = useState(0);
  return (
    <div className="hero-actions mt-12">
      <div className="flex items-stretch gap-1 sm:gap-2" role="group" aria-label="The four letters of L.O.O.M.">
        {LETTERS.map((l, i) => {
          const on = i === active;
          return (
            <div key={`${l.name}-${i}`} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-pressed={on}
                className="group flex w-full flex-col items-center gap-2 rounded-xl px-1 py-3 outline-none transition focus-visible:ring-2 focus-visible:ring-[#e8c26a]"
              >
                <span
                  aria-hidden="true"
                  className="font-display grid size-12 place-items-center rounded-full border text-2xl transition-all duration-200 sm:size-14 sm:text-3xl"
                  style={on
                    ? { borderColor: l.color, color: l.color, boxShadow: `0 0 24px ${l.color}44`, transform: "scale(1.08)" }
                    : { borderColor: "rgba(244,241,232,0.25)", color: "rgba(244,241,232,0.55)" }}
                >
                  {l.letter}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-[11px]" style={{ color: on ? l.color : "rgba(244,241,232,0.5)" }}>
                  {l.name}
                </span>
              </button>
              {i < LETTERS.length - 1 && (
                <span aria-hidden="true" className="relative mx-1 h-px flex-1 self-center overflow-hidden sm:mx-2" style={{ background: "rgba(244,241,232,0.15)" }}>
                  <span className="absolute inset-0 origin-left transition-transform duration-300" style={{
                    background: on || active === i + 1 ? LETTERS[Math.max(active, i)].color : "transparent",
                    transform: `scaleX(${on || active === i + 1 ? 1 : 0})`
                  }} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 min-h-6 text-center text-sm leading-6 sm:text-left" style={{ color: "rgba(244,241,232,0.72)" }} aria-live="polite">
        <strong className="font-display text-base" style={{ color: LETTERS[active].color }}>{LETTERS[active].name}.</strong>{" "}
        {LETTERS[active].body}{" "}
        <a href="#pillars" className="font-semibold underline decoration-dotted underline-offset-4" style={{ color: "#e8c26a" }}>
          See how they connect
        </a>
      </p>
    </div>
  );
}
