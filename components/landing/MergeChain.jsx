"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const LINKS = [
  { name: "Certificate", body: "Paper proof. It says you attended.", dim: true },
  { name: "Skill", body: "You can actually do the thing, on demand.", dim: false },
  { name: "Project", body: "The skill becomes something that exists in the world.", dim: false },
  { name: "Commit", body: "Your work enters a shared history, reviewed by others.", dim: false },
  { name: "Pull request", body: "You propose change to a real codebase — and defend it.", dim: false },
  { name: "Merge", body: "Public proof no certificate can fake. The world runs your code.", dim: false, final: true }
];

/* Scroll narrative: a descent from paper proof to public proof. A spine
   fills as each stage locks in; the certificate fades while the merge
   ignites. Pure scroll-scrub, still under reduced motion. */
export function MergeChain() {
  const rootRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.to(".merge-fill", {
        scaleY: 1, ease: "none",
        scrollTrigger: { trigger: rootRef.current, start: "top 70%", end: "bottom 60%", scrub: 0.6 }
      });
      gsap.utils.toArray(".merge-step").forEach((el) => {
        gsap.fromTo(el, { y: 28, opacity: 0.25 },
          { y: 0, opacity: 1, duration: 0.5, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 82%" } });
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="kicker">Thread 06 — The metric shift</p>
        <h2 className="font-display mt-5 text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
          From holding certificates<br />
          <em className="font-light text-shader">to merging code.</em>
        </h2>
        <p className="mt-6 max-w-md leading-7" style={{ color: "var(--text-muted)" }}>
          The classroom makes passive consumers of knowledge. L.O.O.M. measures
          something else — follow the thread down.
        </p>
        <div className="mt-7 hidden lg:block">
          <Link href="/student/opensource" className="btn-ink">
            Enter the open-source portal <ArrowRight size={16} />
          </Link>
        </div>
      </div>
      <ol className="relative">
        <span aria-hidden="true" className="absolute bottom-6 left-[19px] top-2 w-px" style={{ background: "var(--line)" }} />
        <span aria-hidden="true" className="merge-fill absolute left-[19px] top-2 w-px origin-top" style={{
          height: "calc(100% - 2rem)", transform: "scaleY(0)",
          background: "linear-gradient(to bottom, var(--thread-cyan), var(--thread-gold), var(--thread-coral))"
        }} />
        {LINKS.map((s, i) => (
          <li key={s.name} className="merge-step relative pb-10 pl-14 last:pb-0">
            <span aria-hidden="true"
              className="font-display absolute left-0 top-0 grid size-10 place-items-center rounded-full border text-sm"
              style={s.final
                ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314", boxShadow: "0 0 28px var(--glow-gold)" }
                : { borderColor: "var(--accent)", background: "var(--bg)", color: "var(--text)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="font-display text-2xl font-medium sm:text-3xl"
              style={s.dim ? { color: "var(--text-muted)", opacity: 0.65 } : { color: "var(--text)" }}>
              {s.name}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-2 lg:hidden">
        <Link href="/student/opensource" className="btn-ink">
          Enter the open-source portal <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
