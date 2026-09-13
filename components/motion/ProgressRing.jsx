"use client";

import { motion, useReducedMotion } from "motion/react";

export function ProgressRing({ value, label }) {
  const reduce = useReducedMotion();
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative grid size-36 place-items-center">
      <svg className="-rotate-90" width="144" height="144" viewBox="0 0 144 144" aria-hidden="true">
        <circle cx="72" cy="72" r={radius} fill="none" stroke="var(--surface-muted)" strokeWidth="12" />
        <motion.circle
          cx="72"
          cy="72"
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeLinecap="round"
          strokeWidth="12"
          strokeDasharray={circumference}
          initial={reduce ? { strokeDashoffset: offset } : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-mono text-3xl font-semibold">{value}%</p>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  );
}
