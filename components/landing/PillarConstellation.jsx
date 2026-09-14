"use client";

import { useState } from "react";

const PILLARS = [
  { letter: "L", name: "Learning", color: "#3fd2e0", pos: [200, 44], body: "Gaining knowledge and fundamentals — structured beginner-level guidance, not fragmented links.", feeds: "Learning unlocks opportunity." },
  { letter: "O", name: "Opportunity", color: "#e8a83e", pos: [56, 200], body: "Access to projects, competitions, talks, and exposure for every member.", feeds: "Exposure drives contribution." },
  { letter: "O", name: "Open Source", color: "#e86a5e", pos: [344, 200], body: "Contributing beyond the classroom and collaborating in public.", feeds: "Contribution creates accountability." },
  { letter: "M", name: "Mentorship", color: "#8fa8c8", pos: [200, 356], body: "Seniors helping juniors grow — until juniors become mentors themselves.", feeds: "Mentorship fuels continuous learning." }
];

const RING = [[200, 44], [344, 200], [200, 356], [56, 200]];

/* Signature moment: the four pillars as a diamond constellation around a
   LOOM knot. Hover/focus/keyboard-select a node to light its threads and
   read its promise. On mobile it recomposes into a vertical spine. */
export function PillarConstellation() {
  const [active, setActive] = useState(0);
  const a = PILLARS[active];
  return (
    <div>
      {/* Desktop / tablet constellation */}
      <div className="mt-12 hidden items-stretch gap-10 md:grid md:grid-cols-[1.1fr_1fr]">
        <svg viewBox="0 0 400 400" className="w-full" role="group" aria-label="L.O.O.M. constellation diagram">
          {RING.map(([x1, y1], i) => {
            const [x2, y2] = RING[(i + 1) % RING.length];
            const lit = active === i || active === (i + 1) % RING.length;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit ? PILLARS[active].color : "var(--line)"} strokeWidth={lit ? 1.6 : 1} opacity={lit ? 0.9 : 0.7} className="transition-all duration-300" />;
          })}
          {PILLARS.map((p, i) => (
            <line key={`s${i}`} x1={p.pos[0]} y1={p.pos[1]} x2={200} y2={200}
              stroke={active === i ? p.color : "var(--line)"} strokeWidth={active === i ? 1.6 : 1}
              strokeDasharray={active === i ? "none" : "3 5"} opacity={active === i ? 0.9 : 0.6} className="transition-all duration-300" />
          ))}
          <circle cx={200} cy={200} r={30} fill="none" stroke="var(--accent)" strokeWidth={1.4} opacity={0.9} />
          <circle cx={200} cy={200} r={4} fill="var(--accent)" />
          <text x={200} y={248} textAnchor="middle" fill="var(--text-muted)" fontSize={11} fontFamily="monospace" letterSpacing={3}>LOOM</text>
          {PILLARS.map((p, i) => (
            <g key={p.name + i} role="button" tabIndex={0} aria-label={`${p.name}: ${p.body}`}
              aria-pressed={active === i}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(i); } }}
              className="cursor-pointer outline-none" style={{ outline: "none" }}>
              <circle cx={p.pos[0]} cy={p.pos[1]} r={active === i ? 34 : 28} fill="var(--bg)"
                stroke={p.color} strokeWidth={active === i ? 2 : 1.2}
                opacity={active === i ? 1 : 0.75} className="transition-all duration-300"
                style={active === i ? { filter: `drop-shadow(0 0 10px ${p.color}66)` } : undefined} />
              <text x={p.pos[0]} y={p.pos[1] + 11} textAnchor="middle" fontSize={30} fontFamily="Fraunces, Georgia, serif"
                fill={p.color} opacity={active === i ? 1 : 0.8} className="transition-all duration-300">{p.letter}</text>
            </g>
          ))}
        </svg>
        <div className="flex flex-col justify-center">
          <p className="kicker" aria-hidden="true">Thread {String(active + 1).padStart(2, "0")} / 04</p>
          <h3 className="font-display mt-4 text-4xl font-medium transition-colors duration-300 lg:text-5xl" style={{ color: a.color }} aria-live="polite">
            {a.name}
          </h3>
          <p className="mt-4 max-w-md leading-7" style={{ color: "var(--text-muted)" }}>{a.body}</p>
          <p className="mt-5 border-l-2 pl-4 text-sm font-semibold leading-6" style={{ borderColor: a.color, color: "var(--text)" }}>
            {a.feeds}
          </p>
          <div className="mt-7 flex gap-2" role="group" aria-label="Choose a pillar">
            {PILLARS.map((p, i) => (
              <button key={p.name + i} type="button" onClick={() => setActive(i)} aria-pressed={active === i}
                aria-label={`Show ${p.name}`}
                className="h-1.5 flex-1 rounded-full transition-all duration-300"
                style={{ background: active === i ? p.color : "var(--line)" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: vertical spine, one thread per pillar */}
      <ol className="mt-10 md:hidden">
        {PILLARS.map((p, i) => (
          <li key={p.name + i} className="relative border-l-2 pb-8 pl-6 last:pb-0" style={{ borderColor: "var(--line)" }}>
            <span aria-hidden="true" className="font-display absolute -left-[22px] top-0 grid size-11 place-items-center rounded-full border text-xl"
              style={{ borderColor: p.color, color: p.color, background: "var(--bg)" }}>{p.letter}</span>
            <h3 className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>{p.name}</h3>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{p.body}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: p.color }}>{p.feeds}</p>
          </li>
        ))}
      </ol>
      <p className="mt-10 max-w-3xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>
        Learning unlocks opportunity. Exposure drives contribution. Open source creates public
        accountability. Mentorship loops back to fuel continuous learning.
        <span className="mt-3 block text-xs font-semibold uppercase tracking-[0.14em]">
          Beginner-friendly · Inclusive · Collaborative · Contribution-driven
        </span>
      </p>
    </div>
  );
}
