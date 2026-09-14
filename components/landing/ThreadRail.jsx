"use client";

import { useEffect, useState } from "react";

const STOPS = [
  ["ecosystem", "The thesis"],
  ["pillars", "L·O·O·M"],
  ["journey", "The loop"],
  ["network", "Living network"],
  ["cadence", "Calendar"],
  ["merge", "Certificates → merges"],
  ["product", "The platform"],
  ["colleges", "Proof"],
  ["find", "Your thread"],
  ["opportunities", "Join"]
];

/* Persistent LOOM thread: a fixed left rail (desktop only) that maps the
   page. Nodes light as sections pass; click travels. Hidden on touch and
   under reduced motion it renders statically without animation. */
export function ThreadRail() {
  const [active, setActive] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const sections = STOPS.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setActive(e.target.id);
      }
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach((s) => io.observe(s));
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? h.scrollTop / max : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <nav aria-label="Page threads" className="thread-rail fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 xl:block">
      <ul className="relative flex flex-col items-center gap-4 py-2">
        <span className="absolute inset-y-2 w-px" aria-hidden="true" style={{ background: "var(--line)" }} />
        <span className="absolute top-2 w-px origin-top" aria-hidden="true" style={{ height: `calc((100% - 16px) * ${progress})`, background: "var(--accent)" }} />
        {STOPS.map(([id, label]) => {
          const on = active === id;
          return (
            <li key={id} className="group relative flex items-center">
              <a
                href={`#${id}`}
                aria-label={`Go to ${label}`}
                aria-current={on ? "true" : undefined}
                className="block size-2.5 rounded-full border transition-all duration-200"
                style={on
                  ? { background: "var(--accent)", borderColor: "var(--accent)", boxShadow: "0 0 12px var(--glow-gold)", transform: "scale(1.35)" }
                  : { background: "var(--bg)", borderColor: "var(--text-muted)" }}
              />
              <span className="pointer-events-none absolute left-5 whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text)" }}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
