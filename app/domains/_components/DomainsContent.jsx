import { PublicFooter } from "@/components/landing/PublicFooter";
import { JsonLd, itemListSchema } from "@/components/seo/JsonLd";
import { absoluteUrl } from "@/lib/seo";
import { DEPARTMENT_CATALOG, VERTICAL_LABEL, catalogCounts } from "@/lib/department-catalog";
import { GradientCard, ScrollBaseAnimation } from "./DomainMotion";
import "../domains.css";

// The public catalogue is the shipped thirteen, not a hand-written subset. It
// used to list eleven entries with retired slugs (backend, devops, pr_outreach,
// sponsorship_evm), so four cards linked to pages that no longer existed while
// five real departments were unreachable from /domains. Cards now read from
// lib/department-catalog.js — the same source as their cover art and the
// department workspace.
const badgeColors = [
  "var(--primary)",
  "var(--pillar-o1)",
  "var(--pillar-m)",
  "var(--pillar-o2)"
];

function cards(vertical) {
  return DEPARTMENT_CATALOG.filter((d) => d.vertical === vertical).map((d, i) => ({
    badgeText: `Domain ${String(DEPARTMENT_CATALOG.indexOf(d) + 1).padStart(2, "0")}`,
    badgeColor: badgeColors[i % badgeColors.length],
    accent: d.accent,
    title: d.name,
    description: d.description,
    ctaText: `Explore ${d.shortName}`,
    ctaHref: `/domains/${d.slug}`,
    imageUrl: `/departments/${d.slug}.png`,
    slug: d.slug,
    vertical: d.vertical
  }));
}

function ThreadHeading({ thread, title, subtitle }) {
  return (
    <div className="mb-10">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-primary">
        {thread}
      </p>
      <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-lg text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export default function DomainsContent() {
  const technicalCards = cards("technical");
  const nonTechnicalCards = cards("non_technical");
  const counts = catalogCounts();
  const departments = [...technicalCards, ...nonTechnicalCards];

  return (
    <>
      <main
        id="main"
        className="loom-domains min-h-screen bg-background bg-grid text-foreground"
      >
        <JsonLd
          data={itemListSchema({
            name: "LOOM departments",
            items: departments.map((d) => ({
              name: d.title,
              url: absoluteUrl(`/domains/${d.slug}`)
            }))
          })}
        />
        <div>
          {/* Hero */}
          <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-8 sm:pt-28">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-primary">
              LOOM
            </p>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
              Choose your{" "}
              <span className="font-serif font-normal italic text-primary">
                department.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Thirteen departments, each with its own work, its own workspace and
              its own two heads. Technical teams build and break things; the
              non-technical teams make sure the work reaches people, runs on time,
              and is written down.
            </p>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Join one to start, or explore several. Every department tells you
              exactly what it owns before you commit.
            </p>
            <p className="mt-8 inline-flex rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80">
              {counts.technical} {VERTICAL_LABEL.technical} Departments ·{" "}
              {counts.nonTechnical} {VERTICAL_LABEL.non_technical} Departments
            </p>
          </section>

          {/* Thread 01 — Technical Departments */}
          <section className="pb-16">
            <div className="py-10">
              <ScrollBaseAnimation
                delay={500}
                baseVelocity={-3}
                clasname="font-semibold tracking-[-0.05em] leading-[90%] text-foreground/90"
              >
                Explore. Experiment. Engineer.
              </ScrollBaseAnimation>
            </div>
            <div className="mx-auto max-w-6xl px-4 sm:px-8">
              <ThreadHeading
                thread="Thread 01"
                title="Technical Departments"
                subtitle="Explore. Experiment. Engineer."
              />
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-10">
                {technicalCards.length === 0 && (
                  <p className="text-muted-foreground">
                    No technical departments published yet. Check back soon.
                  </p>
                )}
                {technicalCards.map((domain) => (
                  <GradientCard key={domain.slug} {...domain} />
                ))}
              </div>
            </div>
          </section>

          {/* Thread 02 — Non-Technical Departments */}
          <section className="pb-16">
            <div className="py-10">
              <ScrollBaseAnimation
                delay={500}
                baseVelocity={3}
                clasname="font-semibold tracking-[-0.05em] leading-[90%] text-foreground/90"
              >
                Great technology needs more than code.
              </ScrollBaseAnimation>
            </div>
            <div className="mx-auto max-w-6xl px-4 sm:px-8">
              <ThreadHeading
                thread="Thread 02"
                title="Non-Technical Departments"
                subtitle="Great technology needs more than code."
              />
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-10">
                {nonTechnicalCards.length === 0 && (
                  <p className="text-muted-foreground">
                    No non-technical departments published yet. Check back soon.
                  </p>
                )}
                {nonTechnicalCards.map((domain) => (
                  <GradientCard key={domain.slug} {...domain} />
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
