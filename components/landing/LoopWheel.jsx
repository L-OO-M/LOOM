"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { name: "Beginner", body: "Zero assumed knowledge. Onboarding turns curiosity into a first step." },
  { name: "Learn", body: "Follow roadmaps with milestones and mentors — never an endless feed of links." },
  { name: "Practice", body: "Weekly contests and steady reps. Streaks are a side effect, not the goal." },
  { name: "Build", body: "Ship team projects every semester. Proof beats progress." },
  { name: "Collaborate", body: "Merge into open source and hackathons beyond the classroom." },
  { name: "Mentor Others", body: "Guide the next intake. The loop closes — and restarts with a new beginner." }
];

const R = 150, C = 200;
const pt = (i) => {
  const a = (Math.PI * 2 * i) / STEPS.length - Math.PI / 2;
  return [C + R * Math.cos(a), C + R * Math.sin(a)];
};

/* The journey as a real loop: six stations on a ring with a closing arc
   from Mentor back to Beginner. Auto-tours until the visitor takes over;
   still under reduced motion. Mobile recomposes to a vertical chain. */
export function LoopWheel() {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const pick = (i) => { setActive(i); setTouched(true); };

  useEffect(() => {
    if (touched) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 3200);
    return () => clearInterval(t);
  }, [touched]);

  return (
    <div>
      <div className="mt-12 hidden items-center gap-10 md:grid md:grid-cols-[1.1fr_1fr]">
        <svg viewBox="0 0 400 400" className="w-full" role="group" aria-label="The student journey loop">
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--line)" strokeWidth={1.2} />
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--accent)" strokeWidth={1.6}
            strokeDasharray={`${(2 * Math.PI * R * (active + 1)) / STEPS.length} ${2 * Math.PI * R}`}
            strokeLinecap="round" transform={`rotate(-90 ${C} ${C})`} className="transition-all duration-700" opacity={0.85} />
          {STEPS.map((s, i) => {
            const [x, y] = pt(i);
            const on = active === i;
            return (
              <g key={s.name} role="button" tabIndex={0} aria-label={`Step ${i + 1}: ${s.name}. ${s.body}`}
                aria-pressed={on}
                onMouseEnter={() => pick(i)} onFocus={() => pick(i)} onClick={() => pick(i)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(i); } }}
                className="cursor-pointer outline-none">
                <circle cx={x} cy={y} r={on ? 22 : 16} fill={on ? "var(--accent)" : "var(--bg)"}
                  stroke="var(--accent)" strokeWidth={1.4} className="transition-all duration-300" />
                <text x={x} y={y + 5} textAnchor="middle" fontSize={12} fontFamily="monospace" fontWeight={700}
                  fill={on ? "#101314" : "var(--text)"} className="transition-all duration-300">
                  {String(i + 1).padStart(2, "0")}
                </text>
              </g>
            );
          })}
          <text x={C} y={C - 8} textAnchor="middle" fill="var(--text-muted)" fontSize={11} fontFamily="monospace" letterSpacing={2}>THE LOOP</text>
          <text x={C} y={C + 14} textAnchor="middle" fill="var(--accent)" fontSize={13} fontFamily="monospace" fontWeight={700}>↺ restarts</text>
        </svg>
        <div className="flex flex-col justify-center">
          <p className="kicker" aria-hidden="true">Station {String(active + 1).padStart(2, "0")} / 06</p>
          <h3 className="font-display mt-4 text-4xl font-medium lg:text-5xl" style={{ color: "var(--text)" }} aria-live="polite">
            {STEPS[active].name}
          </h3>
          <p className="mt-4 max-w-md leading-7" style={{ color: "var(--text-muted)" }}>{STEPS[active].body}</p>
          <div className="mt-7 flex gap-2" role="group" aria-label="Choose a station">
            {STEPS.map((s, i) => (
              <button key={s.name} type="button" onClick={() => pick(i)} aria-pressed={active === i}
                aria-label={`Show ${s.name}`}
                className="h-1.5 flex-1 rounded-full transition-all duration-300"
                style={{ background: active === i ? "var(--accent)" : "var(--line)" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: vertical chain with a return spine */}
      <ol className="mt-10 md:hidden">
        {STEPS.map((s, i) => (
          <li key={s.name} className="relative border-l-2 pb-8 pl-6 last:pb-0" style={{ borderColor: i === STEPS.length - 1 ? "var(--accent)" : "var(--line)" }}>
            <span aria-hidden="true" className="absolute -left-[18px] top-0 grid size-9 place-items-center rounded-full border font-mono text-[11px] font-bold"
              style={i === STEPS.length - 1
                ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314" }
                : { borderColor: "var(--accent)", color: "var(--text)", background: "var(--bg)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>{s.name}</h3>
            <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{s.body}</p>
            {i === STEPS.length - 1 && (
              <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>↺ loops back to Beginner</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
