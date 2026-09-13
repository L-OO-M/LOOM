"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowRight, BookOpen, BriefcaseBusiness, Code2, Github,
  GraduationCap, Medal, Menu, Users, X
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const navLinks = [
  ["Product", "#product"],
  ["Learning", "#learning"],
  ["Opportunities", "#opportunities"],
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

const steps = [
  ["01", "Choose your direction", "Start with your interests, experience, and goals — not a generic curriculum."],
  ["02", "Learn by building", "Move through focused resources, guided practice, and collaborative projects."],
  ["03", "Make growth visible", "Track contribution, milestones, mentorship, and opportunities in one record."]
];

const domains = [
  ["AI / ML", "ML fundamentals, paper-reading sessions, dataset-based contests, applied AI projects"],
  ["Web Development", "HTML/CSS/JavaScript bootcamps, framework workshops, society website, Git & deployment"],
  ["Cybersecurity", "Ethical hacking within legal boundaries, CTF practice, cryptography basics, secure coding"],
  ["DSA", "Weekly problem-solving, contest practice, interview preparation, mock tests"],
  ["Blockchain", "Distributed-ledger fundamentals, smart contracts, Web3 mini-projects"]
];

export default function LandingPage() {
  const heroRef = useRef(null);
  const visualRef = useRef(null);
  const featuresRef = useRef(null);
  const stepsRef = useRef(null);
  const collegesRef = useRef(null);
  const ctaRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState(null);

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
        .fromTo(".hero-actions", { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, "-=0.2")
        .fromTo(visualRef.current, { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7 }, "-=0.4");

      for (const [ref, sel] of [[featuresRef, ".feature-card"], [stepsRef, ".step-row"], [collegesRef, ".college-reveal"], [ctaRef, ".cta-content"]]) {
        if (!ref.current) continue;
        gsap.fromTo(ref.current.querySelectorAll(sel),
          { y: 32, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: ref.current, start: "top 80%" } }
        );
      }
    }, [heroRef, visualRef, featuresRef, stepsRef, collegesRef, ctaRef]);

    return () => ctx.revert();
  }, []);

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <header className="fixed top-0 z-50 h-16 w-full border-b backdrop-blur-md" style={{ borderColor: "var(--line)", background: "var(--nav-bg)" }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <BrandMark size={30} />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} className="text-sm font-medium transition hover:opacity-100" style={{ color: "var(--text-muted)" }}>
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
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
          <button
            className="rounded-lg p-2 lg:hidden"
            style={{ color: "var(--text)" }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
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

      <section ref={heroRef} className="relative mx-auto mt-16 max-w-7xl px-5 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pb-28">
        <div className="ambient-wash" aria-hidden="true" />
        <span className="ghost-type right-6 top-2 hidden text-[9rem] opacity-60 lg:block" aria-hidden="true">LOOM</span>
        <div className="relative max-w-4xl">
          <p className="hero-label kicker mb-7 flex items-center gap-3">
            <span className="inline-block h-px w-8" style={{ background: "var(--accent)" }} />
            The operating system for student growth
          </p>
          <h1 className="hero-title font-display text-6xl font-medium leading-[0.95] sm:text-7xl lg:text-[6.5rem]" style={{ color: "var(--text)" }}>
            Build the future<br />
            <em className="font-light" style={{ color: "var(--text-muted)" }}>you are becoming.</em>
          </h1>
          <p className="hero-desc mt-8 max-w-2xl text-base leading-8 sm:text-lg" style={{ color: "var(--text-muted)" }}>
            L.O.O.M. connects personalized roadmaps, trusted resources, real developer activity, projects, contests, mentorship, and measurable growth — so every student knows where to go next.
          </p>
          <div className="hero-actions mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="btn-ink justify-center !px-6 !py-3 !text-base">
              Start your journey <ArrowRight size={17} strokeWidth={2} />
            </Link>
            <a href="#product" className="btn-ghost justify-center !px-6 !py-3 !text-base">Explore the platform</a>
          </div>
        </div>
        <JourneyMap panelRef={visualRef} />
      </section>

      <section className="border-y px-5 py-8 lg:px-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-3">
          <Stat value="5" label="Focus domains, from AI/ML to blockchain" />
          <Stat value="Weekly" label="Open problem-solving and contest practice" />
          <Stat value="2×" label="Workshops per domain, every semester" />
        </div>
      </section>

      <section id="product" ref={featuresRef} className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid gap-8 border-b pb-14 lg:grid-cols-2" style={{ borderColor: "var(--line)" }}>
          <p className="kicker">One connected system</p>
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

      <section ref={stepsRef} className="px-5 py-20 lg:px-8 lg:py-28" style={{ background: "#101314", color: "#f2f3f1" }}>
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="college-reveal">
            <p className="kicker">How L.O.O.M. works</p>
            <h2 className="font-display mt-5 text-4xl font-medium sm:text-5xl">Clarity before velocity.</h2>
          </div>
          <ol className="border-t" style={{ borderColor: "rgba(242,243,241,0.2)" }}>
            {steps.map(([n, t, c]) => (
              <li key={n} className="step-row grid gap-4 border-b py-8 sm:grid-cols-[64px_1fr]" style={{ borderColor: "rgba(242,243,241,0.2)" }}>
                <span className="text-sm" style={{ color: "var(--accent)" }}>{n}</span>
                <div>
                  <h3 className="text-xl font-semibold">{t}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: "rgba(242,243,241,0.65)" }}>{c}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="colleges" ref={collegesRef} className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div className="college-reveal">
            <p className="kicker">For colleges</p>
            <h2 className="font-display mt-5 text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
              See the learning culture taking shape.
            </h2>
            <p className="mt-6 max-w-xl leading-7" style={{ color: "var(--text-muted)" }}>
              Give faculty and student leaders a clear view of participation, project momentum, workshops, mentoring, and outcomes — without reducing students to vanity metrics.
            </p>
            <ul className="mt-8 space-y-4 text-sm" style={{ color: "var(--text)" }}>
              {["Participation across every year and branch", "Semester roadmaps and activity continuity", "Evidence of projects, practice, and contribution"].map((text) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="size-1.5 shrink-0" style={{ background: "var(--accent)" }} />{text}
                </li>
              ))}
            </ul>
          </div>
          <InstitutionPanel />
        </div>
      </section>

      <ChapterStrip />

      <section id="opportunities" ref={ctaRef} className="scroll-mt-20 border-y px-5 py-20 text-center lg:px-8 lg:py-24" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
        <div className="cta-content mx-auto max-w-3xl">
          <p className="kicker">Your next chapter</p>
          <h2 className="font-display mt-5 text-4xl font-medium sm:text-6xl" style={{ color: "var(--text)" }}>
            Begin with curiosity.<br /><em className="font-light">Leave with momentum.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-xl leading-7" style={{ color: "var(--text-muted)" }}>
            No prior skill required. Bring your questions, choose a direction, and start building with people who want you to grow.
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
                Learning, Opportunity, Open source, and Mentorship — woven into one student journey.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              <FooterGroup title="Product" links={[["Roadmaps", "/student/roadmap"], ["Projects", "/student/projects"], ["Mentorship", "/student/mentorship"]]} />
              <FooterGroup title="Resources" links={[["Learning paths", "/student/resources"], ["Contests", "/student/contests"], ["Open source", "/student/opensource"]]} />
              <FooterGroup title="Company" links={[["For colleges", "#colleges"], ["Admin setup", "/setup"], ["Sign in", "/login"]]} />
              <FooterGroup title="Legal" links={[["Privacy", "/student/privacy"], ["Settings", "/student/settings"], ["Get started", "/register"]]} />
            </div>
          </div>
          <div className="mt-16 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:justify-between" style={{ borderColor: "rgba(242,243,241,0.15)", color: "rgba(242,243,241,0.5)" }}>
            <p>© 2026 L.O.O.M. Technical Society</p>
            <p>Beginner-friendly. Contribution-driven.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function ChapterStrip() {
  const [chapters, setChapters] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/chapters").then((r) => r.json()).then((d) => {
      if (live && d.ok) setChapters(d.data.chapters);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!chapters || chapters.length === 0) return null;
  return (
    <section className="px-5 py-16 lg:px-8" aria-label="Chapters">
      <div className="mx-auto max-w-7xl">
        <p className="kicker">Chapters</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display max-w-xl text-3xl font-medium sm:text-4xl" style={{ color: "var(--text)" }}>
            One society, many campuses.
          </h2>
          <Link href="/register" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Bring L.O.O.M. to your college →
          </Link>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {chapters.slice(0, 6).map((c) => (
            <li key={c.slug} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="font-medium" style={{ color: "var(--text)" }}>{c.public_name}</p>
              <p className="mt-3 font-mono text-sm" style={{ color: "var(--text)" }}>
                {c.members} <span className="font-sans text-xs" style={{ color: "var(--text-muted)" }}>members · {c.oss_merges} OSS merges</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function JourneyMap({ panelRef }) {
  return (
    <div ref={panelRef} className="card-sheen relative mt-16 rounded-2xl border p-5 sm:p-8 lg:ml-auto lg:w-[64%]" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex items-center justify-between gap-3 border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <div>
          <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Your learning journey</p>
          <p className="font-display mt-1 text-2xl font-semibold" style={{ color: "var(--text)" }}>Web Development Foundations</p>
        </div>
        <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>Sample</span>
      </div>
      <div className="relative mt-8 grid gap-5 sm:grid-cols-3">
        <div className="absolute left-[15%] right-[15%] top-3 hidden h-px sm:block" style={{ background: "var(--line)" }} />
        {[["01", "Foundations", "Complete", true], ["02", "Build & ship", "In progress", false], ["03", "Open source", "Next", false]].map(([n, t, s, done]) => (
          <div key={n} className="relative">
            <span className="grid size-6 place-items-center border text-[10px] font-semibold" style={done ? { borderColor: "var(--text)", background: "var(--text)", color: "var(--bg)" } : { borderColor: "var(--accent)", background: "transparent", color: "var(--text)" }}>
              {n}
            </span>
            <p className="mt-4 text-sm font-semibold" style={{ color: "var(--text)" }}>{t}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{s}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
            <Github size={14} /> Developer activity
          </div>
          <div className="mt-4 flex gap-1" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className="h-5 flex-1 rounded-[2px]" style={{ background: i % 4 === 0 || i > 13 ? "var(--accent)" : "var(--bg-muted)" }} />
            ))}
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Steady contributions, week after week</p>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Next milestone</p>
          <p className="font-display mt-3 text-xl font-semibold" style={{ color: "var(--text)" }}>Ship your first team project</p>
          <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>Mentor review · paired with a senior</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div className="flex items-baseline gap-4">
      <strong className="font-display text-4xl font-semibold" style={{ color: "var(--text)" }}>{value}</strong>
      <span className="max-w-44 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{label}</span>
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

function InstitutionPanel() {
  return (
    <div className="college-reveal card-sheen rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex items-end justify-between border-b pb-6" style={{ borderColor: "var(--line)" }}>
        <div>
          <p className="text-xs uppercase" style={{ color: "var(--text-muted)" }}>Semester overview</p>
          <p className="font-display mt-2 text-3xl font-semibold" style={{ color: "var(--text)" }}>Program blueprint</p>
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Aug — Dec</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl" style={{ background: "var(--line)" }}>
        {[["05", "Focus domains"], ["Weekly", "Practice & contests"], ["02", "Workshops per domain"], ["01", "Connected journey"]].map(([v, l]) => (
          <div key={l} className="p-5" style={{ background: "var(--bg-elevated)" }}>
            <p className="font-display text-3xl font-semibold" style={{ color: "var(--text)" }}>{v}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Domain focus areas</p>
        <ul className="mt-4 space-y-4">
          {domains.map(([name, focus]) => (
            <li key={name} className="text-xs leading-5">
              <span className="font-semibold" style={{ color: "var(--text)" }}>{name} — </span>
              <span style={{ color: "var(--text-muted)" }}>{focus}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-7 text-[11px] leading-5" style={{ color: "var(--text-muted)" }}>
        The society program runs five tracks in parallel, with shared showcases each semester.
      </p>
    </div>
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
