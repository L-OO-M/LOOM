"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { WeaveField } from "@/components/WeaveField";
import { LoomLetters } from "@/components/landing/LoomLetters";
import { ThreadRail } from "@/components/landing/ThreadRail";
import { PillarConstellation } from "@/components/landing/PillarConstellation";
import { LoopWheel } from "@/components/landing/LoopWheel";
import { LivingNetwork } from "@/components/landing/LivingNetwork";
import { CadenceTimeline } from "@/components/landing/CadenceTimeline";
import { MergeChain } from "@/components/landing/MergeChain";
import { FindThread } from "@/components/landing/FindThread";
import { useTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowRight, BookOpen, BriefcaseBusiness, Code2, Github,
  GraduationCap, Medal, Menu, Moon, Sun, Users, X
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const navLinks = [
  ["Ecosystem", "#ecosystem"],
  ["Pillars", "#pillars"],
  ["Journey", "#journey"],
  ["For Colleges", "#colleges"]
];

const features = [
  { icon: BookOpen, number: "01", title: "Roadmaps", body: "Structured paths from fundamentals to advanced work, with every milestone made clear." },
  { icon: GraduationCap, number: "02", title: "Resources", body: "Curated reading, workshops, and practice selected by mentors — not an endless content feed." },
  { icon: Code2, number: "03", title: "Projects", body: "Build in teams, ship every semester, and create work that proves what you can do." },
  { icon: Github, number: "04", title: "GitHub Growth", body: "Turn steady contribution into a visible developer story grounded in real activity." },
  { icon: Medal, number: "05", title: "Contests", body: "Weekly practice, CTFs, hackathons, and focused challenges that strengthen applied skill." },
  { icon: Users, number: "06", title: "Mentorship", body: "Learn with seniors who remember the first step and help you find the next one." },
  { icon: BriefcaseBusiness, number: "07", title: "Opportunities", body: "Discover project teams, open-source sprints, competitions, and career-building experiences." }
];

const outcomes = [
  { title: "Accessibility", body: "Measurable participation among absolute beginners — the people traditional societies leave out." },
  { title: "Readiness", body: "Placement outcomes built on sustained, documented practice and real project portfolios." },
  { title: "Excellence", body: "Consistent participation — and victories — in external competitions and hackathons." },
  { title: "Network", body: "Alumni and industry connections that feed back into the society, year after year." }
];

export default function LandingPage() {
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const stepsRef = useRef(null);
  const collegesRef = useRef(null);
  const ctaRef = useRef(null);
  const glowRef = useRef(null);
  const magA = useMagnetic();
  const magB = useMagnetic();
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState(null);
  const { theme, toggle, mounted } = useTheme();

  // Cursor glow follower — lerped, transform-only, hero-scoped.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;
    const el = glowRef.current, hero = heroRef.current;
    if (!el || !hero) return;
    let raf = 0, x = 0, y = 0, tx = 0, ty = 0, seen = false;
    const render = () => {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.opacity = seen ? "1" : "0";
      if (Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) raf = requestAnimationFrame(render);
      else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(render); };
    const onMove = (e) => {
      const r = hero.getBoundingClientRect();
      tx = e.clientX - r.left; ty = e.clientY - r.top; seen = true;
      kick();
    };
    hero.addEventListener("pointermove", onMove, { passive: true });
    return () => { hero.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  // One delegated spotlight: any .spot-card lights up under the cursor
  // via CSS vars — zero React state, zero re-renders.
  useEffect(() => {
    const onMove = (e) => {
      const card = e.target?.closest?.(".spot-card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user?.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(".hero-label", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 })
        .fromTo(".hero-title", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, "-=0.3")
        .fromTo(".hero-desc", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, "-=0.3")
        .fromTo(".hero-actions", { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, "-=0.2");

      for (const [ref, sel] of [
        [featuresRef, ".feature-card"], [stepsRef, ".generational-card"],
        [collegesRef, ".college-reveal"], [ctaRef, ".cta-content"]
      ]) {
        if (!ref.current) continue;
        gsap.fromTo(ref.current.querySelectorAll(sel),
          { y: 32, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: ref.current, start: "top 80%" } }
        );
      }
      gsap.utils.toArray(".scroll-reveal").forEach((el) => {
        gsap.fromTo(el,
          { y: 32, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } }
        );
      });

      // Hero drifts away on scroll — content lifts and dissolves into the weave.
      if (heroRef.current) {
        gsap.to(".hero-inner",
          { yPercent: 10, opacity: 0.2, ease: "none", scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: true } }
        );
      }

      // (Loop progress lives inside LoopWheel; merge-chain fill inside MergeChain.)
    }, [heroRef, featuresRef, stepsRef, collegesRef, ctaRef]);

    return () => ctx.revert();
  }, []);

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <header className="fixed top-0 z-50 h-16 w-full border-b backdrop-blur-md" style={{ borderColor: "var(--line)", background: "var(--nav-bg)" }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <BrandMark size={30} />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} className="link-slide text-sm font-medium transition hover:opacity-100" style={{ color: "var(--text-muted)" }}>
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <button
              onClick={toggle}
              className="rounded-full p-2 transition hover:opacity-80 active:scale-95"
              style={{ color: "var(--text-muted)" }}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {mounted && theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {email ? (
              <>
                <span className="max-w-44 truncate text-sm" style={{ color: "var(--text-muted)" }}>{email}</span>
                <Link href="/student" className="btn-ink !py-2">Dashboard</Link>
                <form action="/auth/signout" method="post">
                  <button type="submit" className="btn-ghost !py-2">Sign out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-[10px] px-4 py-2 text-sm font-semibold transition hover:opacity-80" style={{ color: "var(--text)" }}>
                  Sign in
                </Link>
                <Link href="/register" className="btn-ink !py-2">Get started</Link>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 lg:hidden">
            <button
              onClick={toggle}
              className="rounded-lg p-2"
              style={{ color: "var(--text)" }}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {mounted && theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              className="rounded-lg p-2"
              style={{ color: "var(--text)" }}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t px-5 py-4 lg:hidden" style={{ borderColor: "var(--line)", background: "var(--nav-bg)" }} aria-label="Mobile">
            <div className="flex flex-col">
              {navLinks.map(([label, href]) => (
                <a key={label} href={href} onClick={() => setMenuOpen(false)} className="py-3 text-sm font-medium" style={{ color: "var(--text)" }}>
                  {label}
                </a>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {email ? (
                <>
                  <Link href="/student" className="btn-ink justify-center">Dashboard</Link>
                  <Link href="/login" className="btn-ghost justify-center">Account</Link>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn-ghost justify-center">Sign in</Link>
                  <Link href="/register" className="btn-ink justify-center">Get started</Link>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* HERO — navy weave. The society's identity, full-bleed. */}
      <section ref={heroRef} className="relative mt-16 overflow-hidden" style={{ background: "#0a1628" }} aria-label="Introduction">
        {/* Layered light: gold dawn top-left, cyan depth bottom-right, coral ember edge. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{
          background: "radial-gradient(52rem 30rem at 12% -8%, rgba(232,194,106,0.16), transparent 60%), radial-gradient(48rem 32rem at 88% 108%, rgba(63,210,224,0.13), transparent 62%), radial-gradient(30rem 22rem at 82% 12%, rgba(232,106,94,0.08), transparent 60%)"
        }} />
        <WeaveField />
        {/* Film grain — static texture so the gradients never band. */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden="true" style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")"
        }} />
        {/* Bottom fade into the page body. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28" aria-hidden="true" style={{ background: "linear-gradient(to bottom, transparent, rgba(10,22,40,0.9))" }} />
        <div ref={glowRef} className="cursor-glow left-1/2 top-1/3" aria-hidden="true" />
        <div className="hero-inner relative mx-auto max-w-7xl px-5 pb-24 pt-20 sm:px-6 sm:pt-28 lg:px-8 lg:pb-32">
          <p className="hero-label kicker mb-7 flex items-center gap-3" style={{ color: "#e8c26a" }}>
            <span className="inline-block h-px w-8" style={{ background: "#e8c26a" }} />
            A self-sustaining, student-run technical learning community
          </p>
          <h1 className="hero-title font-display max-w-5xl text-6xl font-medium leading-[0.95] sm:text-7xl lg:text-[6.5rem]" style={{ color: "#f4f1e8" }}>
            Weaving the future<br />
            <em className="font-light text-shader">of technical culture.</em>
          </h1>
          <p className="hero-desc mt-8 max-w-2xl text-base leading-8 sm:text-lg" style={{ color: "rgba(244,241,232,0.72)" }}>
            L.O.O.M. is an ecosystem, not an event organizer — a place where students learn, build,
            and grow regardless of prior experience, until they become the mentors of the next intake.
          </p>
          <div className="hero-actions mt-9 flex flex-col gap-3 sm:flex-row">
            <span ref={magA} className="magnet inline-flex">
              <Link href="/register" className="btn-ink justify-center !px-6 !py-3 !text-base">
                Start your journey <ArrowRight size={17} strokeWidth={2} />
              </Link>
            </span>
            <span ref={magB} className="magnet inline-flex">
              <a href="#pillars" className="justify-center !px-6 !py-3 !text-base font-semibold transition hover:opacity-85" style={{ color: "#f4f1e8", border: "1px solid rgba(244,241,232,0.3)", borderRadius: 10 }}>
                What L.O.O.M. means
              </a>
            </span>
          </div>
          <LoomLetters />
        </div>
      </section>

      <ThreadRail />

      {/* THESIS — ecosystem, not event organizer. */}
      <section id="ecosystem" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="scroll-reveal grid gap-8 border-b pb-14 lg:grid-cols-2" style={{ borderColor: "var(--line)" }}>
          <p className="kicker">Thread 01 — The thesis</p>
          <div>
            <h2 className="font-display text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
              An ecosystem,<br />not an event organizer.
            </h2>
            <p className="mt-6 max-w-xl leading-7" style={{ color: "var(--text-muted)" }}>
              Traditional societies recruit, host a few events, hand out certificates, and fade.
              L.O.O.M. is built to do the opposite — on all four fronts that actually matter.
            </p>
          </div>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--line)" }}>
          {[
            ["Accessibility", "Beginners feel hesitant or excluded.", "Strictly beginner-friendly participation and onboarding."],
            ["Guidance", "Fragmented resources without a guided roadmap.", "Structured guidance plus peer-to-peer mentorship."],
            ["Engagement", "Post-recruitment drop-off; one-off events.", "Consistent year-round engagement and hands-on projects."],
            ["Output", "Certificate-oriented and siloed.", "Open-source contribution, hackathons, collaboration."]
          ].map(([title, oldWay, loomWay]) => (
            <div key={title} className="scroll-reveal grid gap-3 py-8 sm:grid-cols-[180px_1fr_1fr] sm:items-baseline">
              <h3 className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>{title}</h3>
              <p className="text-sm leading-6 line-through decoration-2" style={{ color: "var(--text-muted)", textDecorationColor: "rgba(180,60,50,0.5)" }}>{oldWay}</p>
              <p className="text-sm font-medium leading-6" style={{ color: "var(--text)" }}>{loomWay}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PILLARS — the constellation. */}
      <section id="pillars" className="scroll-mt-20 border-y px-5 py-20 lg:px-8 lg:py-28" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
        <div className="mx-auto max-w-7xl">
          <p className="kicker scroll-reveal">Thread 02 — Four letters, one engine</p>
          <h2 className="font-display scroll-reveal mt-5 max-w-3xl text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
            Every letter is a promise. Together, a loop.
          </h2>
          <p className="scroll-reveal mt-5 max-w-2xl leading-7" style={{ color: "var(--text-muted)" }}>
            Touch a letter. Each one lights its threads — and everything eventually feeds everything else.
          </p>
          <div className="scroll-reveal">
            <PillarConstellation />
          </div>
        </div>
      </section>

      {/* JOURNEY — the generational cycle, as a loop. */}
      <section id="journey" ref={stepsRef} className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <p className="kicker scroll-reveal">Thread 03 — The student journey</p>
        <h2 className="font-display scroll-reveal mt-5 max-w-3xl text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
          A self-sustaining cycle of mastery.
        </h2>
        <div className="scroll-reveal">
          <LoopWheel />
        </div>
        <div className="generational-card scroll-reveal mt-10 max-w-3xl rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
          <p className="text-base font-medium leading-7" style={{ color: "var(--text)" }}>
            The generational cycle: the ultimate goal of a member is to become a mentor for the next intake.
          </p>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            That is what makes the culture outlive its founders — and why mentorship sits at the center of the platform, not the edge.
          </p>
          <Link href="/register" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--accent)" }}>
            Enter as a beginner <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* NETWORK — LOOM is already moving. */}
      <section id="network" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <p className="kicker scroll-reveal">Thread 04 — LOOM is already moving</p>
        <h2 className="font-display scroll-reveal mt-5 max-w-3xl text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
          The network, live.
        </h2>
        <p className="scroll-reveal mt-5 max-w-2xl leading-7" style={{ color: "var(--text-muted)" }}>
          Not a metaphor — a map. Every node is a real chapter, every number real members and merges.
          Move your cursor and the nearest threads wake up.
        </p>
        <div className="scroll-reveal">
          <LivingNetwork />
        </div>
      </section>

      {/* CADENCE — the vision, on a timeline. */}
      <section id="cadence" className="relative scroll-mt-20 px-5 py-20 lg:px-8 lg:py-28" style={{ background: "#101314", color: "#f2f3f1" }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden="true" style={{ background: "linear-gradient(to right, transparent, rgba(232,194,106,0.55), transparent)" }} />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ background: "radial-gradient(40rem 20rem at 50% -6rem, rgba(232,194,106,0.07), transparent 65%)" }} />
        <div className="mx-auto max-w-7xl">
          <p className="kicker scroll-reveal">Thread 05 — Year-round, not once a semester</p>
          <h2 className="font-display scroll-reveal mt-5 max-w-3xl text-4xl font-medium sm:text-5xl">
            The vision, on a timeline.
          </h2>
          <p className="scroll-reveal mt-5 max-w-2xl leading-7" style={{ color: "rgba(242,243,241,0.65)" }}>
            Six rhythms keep the ecosystem alive every week of the year. Expand any stop — each one lives somewhere real inside the platform.
          </p>
          <CadenceTimeline />
        </div>
      </section>

      {/* METRIC SHIFT — certificates to merges, as a descent. */}
      <section id="merge" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <MergeChain />
      </section>

      {/* PRODUCT — the platform that runs it. */}
      <section id="product" ref={featuresRef} className="mx-auto max-w-7xl scroll-mt-20 border-t px-5 py-20 sm:px-6 lg:px-8 lg:py-28" style={{ borderColor: "var(--line)" }}>
        <div className="grid gap-8 border-b pb-14 lg:grid-cols-2" style={{ borderColor: "var(--line)" }}>
          <p className="kicker">Thread 07 — One connected system</p>
          <div>
            <h2 className="font-display text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
              Everything growth needs,<br />woven together.
            </h2>
            <p className="mt-6 max-w-xl leading-7" style={{ color: "var(--text-muted)" }}>
              Progress is rarely one course or one contest. L.O.O.M. makes the whole journey coherent, visible, and shared.
            </p>
          </div>
        </div>
        <div id="learning" className="scroll-mt-20 divide-y" style={{ borderColor: "var(--line)" }}>
          {features.map((f) => <Feature key={f.title} {...f} />)}
        </div>
      </section>

      {/* OUTCOMES — proof, monumental. */}
      <section id="colleges" ref={collegesRef} className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <p className="kicker">Thread 08 — For colleges · measured in outcomes</p>
        <h2 className="font-display mt-5 max-w-3xl text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
          Success you can point at.
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2" style={{ borderColor: "var(--line)", background: "var(--line)" }}>
          {outcomes.map((o) => (
            <div key={o.title} className="spot-card college-reveal p-6 sm:p-8" style={{ background: "var(--bg-elevated)" }}>
              <h3 className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>{o.title}</h3>
              <p className="mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>{o.body}</p>
            </div>
          ))}
        </div>
        <LiveStats />
      </section>

      {/* PUBLIC PULSE — real events, projects, and departments. */}
      <section id="upcoming" className="mx-auto max-w-7xl scroll-mt-20 border-t px-5 py-20 sm:px-6 lg:px-8 lg:py-28" style={{ borderColor: "var(--line)" }}>
        <p className="kicker scroll-reveal">Happening soon</p>
        <h2 className="font-display scroll-reveal mt-5 max-w-3xl text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
          Upcoming events.
        </h2>
        <UpcomingEventsStrip />
      </section>

      <section id="showcase" className="mx-auto max-w-7xl scroll-mt-20 border-t px-5 py-20 sm:px-6 lg:px-8 lg:py-28" style={{ borderColor: "var(--line)" }}>
        <p className="kicker scroll-reveal">Built by members</p>
        <h2 className="font-display scroll-reveal mt-5 max-w-3xl text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
          Student work, shipped.
        </h2>
        <ProjectShowcase />
      </section>

      <section id="domains" className="mx-auto max-w-7xl scroll-mt-20 border-t px-5 py-20 sm:px-6 lg:px-8 lg:py-28" style={{ borderColor: "var(--line)" }}>
        <p className="kicker scroll-reveal">Find your thread</p>
        <h2 className="font-display scroll-reveal mt-5 max-w-3xl text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
          Departments, open to beginners.
        </h2>
        <DepartmentQuickLinks />
      </section>

      {/* FIND YOUR THREAD — the onboarding ritual. */}
      <section id="find" className="mx-auto max-w-7xl scroll-mt-20 border-t px-5 py-20 sm:px-6 lg:px-8 lg:py-28" style={{ borderColor: "var(--line)" }}>
        <p className="kicker scroll-reveal">Thread 09 — Find your thread</p>
        <h2 className="font-display scroll-reveal mt-5 max-w-3xl text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
          Enter as whoever you are.
        </h2>
        <p className="scroll-reveal mt-5 max-w-2xl leading-7" style={{ color: "var(--text-muted)" }}>
          Not a brochure — a compass. Tell LOOM what brings you here and it answers with a path.
        </p>
        <div className="scroll-reveal">
          <FindThread />
        </div>
      </section>

      {/* CLOSING — the mantra. */}
      <section id="opportunities" ref={ctaRef} className="relative scroll-mt-20 overflow-hidden border-y px-5 py-20 text-center lg:px-8 lg:py-24" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
        <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ background: "radial-gradient(36rem 20rem at 50% 115%, rgba(63,210,224,0.10), transparent 65%), radial-gradient(28rem 16rem at 50% -10%, rgba(232,168,62,0.10), transparent 60%)" }} />
        <div className="cta-content mx-auto max-w-3xl">
          <p className="kicker">The culture, in one line</p>
          <h2 className="font-display mt-5 text-4xl font-medium sm:text-6xl" style={{ color: "var(--text)" }}>
            Students Learn →<br />Students Build →<br /><em className="font-light text-shader">Students Mentor → Students Contribute.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-xl leading-7" style={{ color: "var(--text-muted)" }}>
            L.O.O.M. exists not to conduct events, but to build a lasting technical culture that outlives its founders.
            No prior skill required — bring your questions.
          </p>
          <Link href="/register" className="btn-ink mt-9 !px-6 !py-3 !text-base">
            Start your journey <ArrowRight size={17} strokeWidth={2} />
          </Link>
        </div>
      </section>

      <footer className="px-5 py-16 lg:px-8" style={{ background: "#101314", color: "#f2f3f1" }}>
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
            <div>
              <BrandMark size={30} />
              <p className="mt-5 max-w-xs text-sm leading-6" style={{ color: "rgba(242,243,241,0.6)" }}>
                <strong style={{ color: "#f2f3f1" }}>L</strong>earning · <strong style={{ color: "#f2f3f1" }}>O</strong>pportunity ·{" "}
                <strong style={{ color: "#f2f3f1" }}>O</strong>pen Source · <strong style={{ color: "#f2f3f1" }}>M</strong>entorship —
                one loop, from beginner to mentor.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              <FooterGroup title="Product" links={[["Roadmaps", "/student/roadmap"], ["Projects", "/student/projects"], ["Mentorship", "/student/mentorship"]]} />
              <FooterGroup title="Resources" links={[["Learning paths", "/student/resources"], ["Contests", "/student/contests"], ["Open source", "/student/opensource"]]} />
              <FooterGroup title="Company" links={[["Ecosystem", "#ecosystem"], ["About", "/about"], ["Events", "/events"], ["FAQ", "/faq"], ["Admin setup", "/setup"], ["Sign in", "/login"]]} />
              <FooterGroup title="Legal" links={[["Privacy", "/student/privacy"], ["Settings", "/student/settings"], ["Get started", "/register"]]} />
            </div>
          </div>
          <p className="mt-14 text-center font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: "rgba(242,243,241,0.4)" }} aria-hidden="true">
            ─── the thread continues ───
          </p>
          <div className="mt-8 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:justify-between" style={{ borderColor: "rgba(242,243,241,0.15)", color: "rgba(242,243,241,0.5)" }}>
            <p>© 2026 L.O.O.M. Technical Society</p>
            <p>Beginner-friendly. Contribution-driven.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* Magnetic pressable — drifts toward the cursor inside a small radius, eases
   home on leave. Transform-only, rAF-lerped, reduced-motion exempt. */
function useMagnetic() {
  const ref = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0, x = 0, y = 0, tx = 0, ty = 0;
    const render = () => {
      x += (tx - x) * 0.2; y += (ty - y) * 0.2;
      el.style.transform = (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1)
        ? `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`
        : "";
      if (el.style.transform) raf = requestAnimationFrame(render);
      else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(render); };
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy), R = 90;
      if (d < R) { const f = (1 - d / R) * 0.35; tx = dx * f; ty = dy * f; }
      else { tx = 0; ty = 0; }
      kick();
    };
    const onLeave = () => { tx = 0; ty = 0; kick(); };
    window.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

/* Live federation proof — real members and merges, or an honest fallback.
   Numbers count up once on entry (final values under reduced motion). */
function LiveStats() {
  const [stats, setStats] = useState(null);
  const [shown, setShown] = useState(null);
  const boxRef = useRef(null);
  useEffect(() => {
    let live = true;
    fetch("/api/chapters").then((r) => r.json()).then((d) => {
      if (!live || !d.ok) return;
      const chapters = d.data?.chapters ?? [];
      setStats({
        students: d.data?.totals?.students ?? chapters.reduce((s, c) => s + (c.members || 0), 0),
        merges: chapters.reduce((s, c) => s + (c.oss_merges || 0), 0),
        chapters: chapters.length
      });
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const items = stats && (stats.students > 0 || stats.chapters > 0)
    ? [
      [stats.students, "students learning across chapters"],
      [stats.merges, "verified open-source merges"],
      [stats.chapters, stats.chapters === 1 ? "chapter, and counting" : "chapters, and counting"]
    ]
    : [
      ["01", "founding chapter — yours could be next"],
      ["00", "merges so far — the first is the hardest"],
      ["05", "learning tracks, open to absolute beginners"]
    ];
  const numeric = items.map(([v]) => /^\d+$/.test(v) ? Number(v) : null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(numeric.map((n) => n ?? 0));
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 1200;
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        setShown(numeric.map((n) => (n == null ? 0 : Math.round(n * e))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);
  return (
    <div ref={boxRef} className="college-reveal mt-10 grid gap-6 border-t pt-8 sm:grid-cols-3" style={{ borderColor: "var(--line)" }}>
      {items.map(([v, l], i) => (
        <div key={l} className="flex items-baseline gap-4">
          <strong className="font-display text-6xl font-semibold sm:text-7xl" style={{ color: "var(--text)" }}>
            {shown && numeric[i] != null ? String(shown[i]).padStart(v.length, "0") : v}
          </strong>
          <span className="max-w-44 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

/* Public pulse — real rows from the public APIs, or honest empty states.
   Same fetch pattern as LiveStats: fire once, .catch(()=>{}) silence. */
function UpcomingEventsStrip() {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public/events").then((r) => r.json()).then((d) => {
      if (!live || !d.ok) return;
      setEvents(d.data?.events ?? []);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const top = (events ?? []).slice(0, 3);
  return (
    <div className="scroll-reveal mt-10">
      {top.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {top.map((e) => (
            <article key={e.id} className="spot-card rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{e.event_type}</p>
              <h3 className="font-display mt-2 text-xl font-medium" style={{ color: "var(--text)" }}>{e.title}</h3>
              <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                {new Date(e.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                {" · "}{e.is_online ? "Online" : (e.location || "Venue TBA")}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-6 max-w-2xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          No upcoming events yet — workshops are posted by department leads through the week. Check back soon.
        </p>
      )}
      <Link href="/events" prefetch={false} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        Full calendar <ArrowRight size={15} />
      </Link>
    </div>
  );
}

function ProjectShowcase() {
  const [projects, setProjects] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public/projects").then((r) => r.json()).then((d) => {
      if (!live || !d.ok) return;
      setProjects(d.data?.projects ?? []);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const top = (projects ?? []).slice(0, 3);
  return (
    <div className="scroll-reveal mt-10">
      {top.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {top.map((p) => (
            <article key={p.id} className="spot-card rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h3 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>{p.title}</h3>
              {p.description && <p className="mt-2 line-clamp-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{p.description}</p>}
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                {p.owner_name ? `by ${p.owner_name}` : "by a member"}
                {p.repo_url ? <> · <a href={p.repo_url} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: "var(--accent)" }}>repo ↗</a></> : null}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-6 max-w-2xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          No showcased projects yet — members ship every semester, and the first builds land here automatically.
        </p>
      )}
      <Link href="/register" prefetch={false} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        Start building <ArrowRight size={15} />
      </Link>
    </div>
  );
}

function DepartmentQuickLinks() {
  const [depts, setDepts] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public/departments").then((r) => r.json()).then((d) => {
      if (!live || !d.ok) return;
      setDepts(d.data?.departments ?? []);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const list = depts ?? [];
  return (
    <div className="scroll-reveal mt-10">
      {list.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <Link key={d.id} href={`/domains/${d.slug}`} prefetch={false} className="spot-card rounded-2xl border p-5 transition hover:opacity-90" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h3 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>{d.name}</h3>
              {d.description && <p className="mt-2 line-clamp-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{d.description}</p>}
              <p className="mt-3 text-xs font-semibold" style={{ color: "var(--accent)" }}>{d.members} member{d.members === 1 ? "" : "s"} →</p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-6 max-w-2xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          Departments are still being set up for this chapter — the directory appears here as soon as the first one goes active.
        </p>
      )}
    </div>
  );
}

function Feature({ icon: Icon, number, title, body }) {
  return (
    <article className="feature-card group grid gap-4 py-8 sm:grid-cols-[64px_1fr_1fr] sm:items-center">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{number}</span>
      <div className="flex items-center gap-4">
        <Icon size={20} strokeWidth={1.5} style={{ color: "var(--accent)" }} />
        <h3 className="font-display text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text)" }}>{title}</h3>
      </div>
      <p className="max-w-lg text-sm leading-6" style={{ color: "var(--text-muted)" }}>{body}</p>
    </article>
  );
}

function FooterGroup({ title, links }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase" style={{ color: "var(--accent)" }}>{title}</p>
      <ul className="mt-4 space-y-3 text-sm" style={{ color: "rgba(242,243,241,0.6)" }}>
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="transition hover:opacity-100 hover:underline">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
