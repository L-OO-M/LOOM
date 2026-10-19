"use client";
import { lazy, Suspense } from "react";
import StackingCards from "./stacking-card";
import { useTheme } from "@/lib/theme";
import { HomeNavigation, useWorkspaceLink } from "./HomeNavigation";
import "./story.css";
import { studentNav } from "@/lib/nav";
import { Brain, Code, Database, Shield, Link2, Server, Zap, Cpu } from "lucide-react";
const learning = "/storyloom/learning.png";
const hackathon = "/storyloom/hackathon.png";
const opportunityIllustration = "/storyloom/opportunity.png";
const opensource = "/storyloom/opensource.png";
const mentorship = "/storyloom/mentorship.png";
import SculptureHero from "./liquid-sculpture-hero";
const DomainCarousel = lazy(() => import("./polaroid-line-carousel"));
const ScrollWords = lazy(() => import("./you-can-scroll"));
const Timeline = lazy(() => import("./timeline"));
const HalftoneFooter = lazy(() => import("./halftone-wordmark-footer"));
const pillars = [
    { letter: "L", title: "Learning", description: "Structured roadmaps, practical resources, and hands-on learning for every skill level.", link: learning, color: "var(--philosophy-learning)", illustration: true, imageAlt: "A curious student studying an open book beside a laptop, with a lightbulb overhead." },
    { letter: "O", title: "Opportunity", description: "Access competitions, industry exposure, collaborations, and career-building experiences.", link: opportunityIllustration, color: "var(--philosophy-opportunity)", illustration: true, imageAlt: "A student carrying a portfolio steps through an open door toward a bright new path." },
    { letter: "O", title: "Open Source", description: "Work on real codebases, collaborate publicly, and build a portfolio through meaningful contributions.", link: opensource, color: "var(--philosophy-opensource)", illustration: true, imageAlt: "Two programmers collaborate on their laptops beneath a shared code-branch symbol." },
    { letter: "M", title: "Mentorship", description: "Connect with experienced peers, exchange knowledge, and guide the next generation of learners.", link: mentorship, color: "var(--philosophy-mentorship)", illustration: true, imageAlt: "A peer mentor explains something on a shared laptop while encouraging a learner." },
];
const journey = [
    { step: "Learn", text: "Start with the fundamentals." },
    { step: "Build", text: "Turn ideas into working projects." },
    { step: "Contribute", text: "Collaborate and create real impact." },
    { step: "Lead", text: "Share your experience and shape the community's future." },
];
const domains = [
    { title: "AI & Machine Learning", caption: "Models, datasets, deep learning, and intelligent systems.", artwork: <Brain />, tint: "var(--primary)" },
    { title: "Web Development", caption: "Frontend, backend, and full-stack applications.", artwork: <Code />, tint: "var(--pillar-o1)" },
    { title: "Backend & APIs", caption: "Databases, authentication, and scalable services.", artwork: <Database />, tint: "var(--pillar-o2)" },
    { title: "Cybersecurity", caption: "Ethical hacking, cryptography, and CTFs.", artwork: <Shield />, tint: "var(--pillar-m)" },
    { title: "Blockchain", caption: "Smart contracts, Web3, and decentralized applications.", artwork: <Link2 />, tint: "var(--pillar-l)" },
    { title: "DevOps & Infrastructure", caption: "Linux, Docker, CI/CD, and cloud deployment.", artwork: <Server />, tint: "var(--pillar-o2)" },
    { title: "DSA & Problem Solving", caption: "Algorithms, coding challenges, and interview preparation.", artwork: <Zap />, tint: "var(--primary)" },
    { title: "Embedded & Hardware", caption: "Arduino, Raspberry Pi, IoT, and electronics.", artwork: <Cpu />, tint: "var(--pillar-o1)" },
];
const sculpturePalette = { dark: "#151412", light: "#f5f1e8", warmDark: "#e9762b", warmLight: "#b84e18" };
const domainCarouselHeight = "clamp(600px, 72svh, 700px)";
function SectionIntro({ eyebrow, title, body }) {
    return (<div className="mx-auto max-w-4xl px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.35em] text-primary">{eyebrow}</p>
      <h2 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">{title}</h2>
      <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">{body}</p>
    </div>);
}
export default function StoryHome() {
    const { theme } = useTheme();
    const workspace = useWorkspaceLink();
    return (<main id="main" className="story-home site-grid bg-background text-foreground">
      <HomeNavigation workspace={workspace} />
      {/* 1 — Hero */}
      <>
        <Suspense fallback={<div className="h-svh bg-background"/>}>
          <SculptureHero theme={theme} showNav={false} showCredit={false} loadFonts={false} src="/storyloom/hero-light.webp" darkSrc="/storyloom/hero-dark.webp" mobileSrc="/storyloom/hero-mobile-light.webp" mobileDarkSrc="/storyloom/hero-mobile-dark.webp" headingFont="var(--font-geist-sans)" bodyFont="var(--font-geist-sans)" accentFont="var(--font-display)" themeToggle={false}  brand="L.O.O.M." navLinks={[
            { label: "About", href: "#about" },
            { label: "Domains", href: "#domains" },
            { label: "Community", href: "#community" },
            { label: "Join", href: "#join" },
        ]} navCta={{ label: "Join", href: "#join" }} eyebrow="Learning · Opportunity · Open Source · Mentorship" headline={"Weaving the future\nof technical culture."} headlineAccent="technical culture." body="A student-led technical community where beginners become builders, contributors, and future mentors. We don't just organize events — we build a culture of continuous learning, collaboration, and real-world impact." primaryCta={{ label: workspace ? "Open Your Workspace" : "Start Your Journey", href: workspace || "/register" }} secondaryCta={{ label: "Explore L.O.O.M.", href: "#about" }} hint="Move across the thread" hintTouch="Touch the thread" backdropText="loom" darkBackground={sculpturePalette.dark} background={sculpturePalette.light} accentColor={theme === "dark" ? sculpturePalette.warmDark : sculpturePalette.warmLight}/>
        </Suspense>
      </>

      {/* 2 — About */}
      <section id="about" className="pt-32">
        <SectionIntro eyebrow="Our philosophy" title="Four pillars. One ecosystem." body="L.O.O.M. connects four essential elements of technical growth to create an inclusive, self-sustaining student community."/>
        <StackingCards projects={pillars}/>
      </section>

      {/* 3 — Domains */}
      <section id="domains" className="pt-24 pb-8">
        <SectionIntro eyebrow="Technical domains" title="Explore. Learn. Specialize." body="Discover your interests, develop practical skills, and collaborate with students across different technologies."/>
        <div className="mt-6">
          <>
            <Suspense fallback={<div style={{ height: domainCarouselHeight }}/>}>
              <DomainCarousel autoplay={0} slides={domains} height={domainCarouselHeight} cardWidth={300} sag={38} swing={0.7} string="var(--primary)" background="var(--background)" ink="var(--foreground)" ariaLabel="Technical domains" style={{
            "--pl-paper": "var(--card)",
            "--pl-paper-border": "var(--border)",
            "--pl-active-border": "color-mix(in oklch, var(--primary) 55%, transparent)",
            "--pl-note-ink": "var(--foreground)",
        }}/>
            </Suspense>
          </>
        </div>
      </section>

      <div className="story-directory"><a href="/domains">Explore the domain directory →</a></div>

      {/* 4 — Community in action */}
      <section id="community" className="pt-24">
        <SectionIntro eyebrow="Activities & impact" title="Beyond classrooms. Into real-world experience." body="Turn technical knowledge into practical experience through hands-on activities, peer mentorship, and meaningful collaboration."/>
        <>
          <Suspense fallback={<div className="h-screen"/>}>
            <Timeline textColor="var(--foreground)" mutedTextColor="var(--muted-foreground)" backgroundColor="var(--background)" title="Learn by Doing" periodLabel="Year-round" activeColor="var(--primary)" imageUrl={hackathon} imageAlt="Three students build and present a hackathon project with a laptop, robot prototype, and demo board." imageVariant="illustration" duration={1.4}/>
          </Suspense>
        </>
      </section>

      <>
        <Suspense fallback={<div className="min-h-svh bg-background"/>}>
          <ScrollWords />
        </Suspense>
      </>

      {/* 5 — Join */}
      <section id="join" className="py-32">
        <SectionIntro eyebrow="Get involved" title="Your journey. Your community. Your impact." body="Whether you're writing your first line of code or building your next big project, there's a place for you at L.O.O.M."/>
        <ol className="mx-auto mt-16 grid max-w-6xl gap-px overflow-hidden rounded-2xl border border-border bg-border px-0 sm:grid-cols-2 lg:grid-cols-4">
          {journey.map((j, i) => (<li key={j.step} className="bg-card p-8 transition-colors hover:bg-secondary">
              <span className="font-mono text-xs text-primary">0{i + 1}</span>
              <h3 className="mt-6 font-serif-accent text-4xl italic">{j.step}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{j.text}</p>
            </li>))}
        </ol>
        <p className="mx-auto mt-12 max-w-xl px-6 text-center text-muted-foreground">
          No prior experience required. Just curiosity, consistency, and a willingness to grow.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3 px-6">
          <a href={workspace || "/register"} className="rounded-full bg-primary px-7 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-105">
            Join the Community
          </a>
          <a href={workspace || "/login"} className="rounded-full border border-border px-7 py-3 text-sm font-medium transition-colors hover:bg-secondary">
            Get Started
          </a>
        </div>
      </section>

      <>
        <Suspense fallback={null}>
          <HalftoneFooter wordmark="loom" label="L.O.O.M. Technical Society" meta={`Beginner-friendly. Contribution-driven. © ${new Date().getFullYear()}`} preset={theme === "dark" ? "night" : "paper"} palette={{
            background: theme === "dark" ? sculpturePalette.dark : sculpturePalette.light,
            ink: theme === "dark" ? "#ede9df" : "#29251f",
            warm: theme === "dark" ? sculpturePalette.warmDark : sculpturePalette.warmLight,
        }} columns={[
            { title: "Explore", links: [{ label: "About", href: "/about" }, { label: "Domains", href: "/domains" }, { label: "Events", href: "/events" }, { label: "FAQ", href: "/faq" }, { label: "Contact", href: "/contact" }] },
            ...studentNav.filter(group => group.children).map(group => ({ title: group.label, links: group.children.map(({ label, href }) => ({ label, href })) })),
            { title: "Join", links: [{ label: "Start your journey", href: "/register" }, { label: "Sign in", href: "/login" }, { label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }] },
        ]}/>
        </Suspense>
      </>
    </main>);
}
