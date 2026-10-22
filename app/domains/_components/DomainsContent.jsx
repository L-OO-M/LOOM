import { PublicFooter } from "@/components/landing/PublicFooter";
import { JsonLd, itemListSchema } from "@/components/seo/JsonLd";
import { absoluteUrl } from "@/lib/seo";
import { GradientCard, ScrollBaseAnimation } from "./DomainMotion";
import domainAi from "../../../public/domains-art/domain-ai.png";
import domainWeb from "../../../public/domains-art/domain-web.png";
import domainInfra from "../../../public/domains-art/domain-infra.png";
import domainCreative from "../../../public/domains-art/domain-creative.png";
import "../domains.css";

const technicalDomains = [
  {
    badgeText: "Domain 01",
    badgeColor: "var(--primary)",
    title: "AI & Machine Learning",
    description:
      "Turn data into intelligence. Explore Python, machine learning, deep learning, computer vision, NLP, and generative AI.",
    ctaText: "Explore AI/ML",
    slug: "ai_ml",
    imageUrl: domainAi,
    gradient: "orange",
  },
  {
    badgeText: "Domain 02",
    badgeColor: "var(--pillar-o1)",
    title: "Web Development",
    description:
      "Build experiences for the web. Learn frontend development, responsive design, JavaScript, modern frameworks, version control, and deployment.",
    ctaText: "Explore Web Development",
    slug: "web",
    imageUrl: domainWeb,
    gradient: "gray",
  },
  {
    badgeText: "Domain 03",
    badgeColor: "var(--pillar-m)",
    title: "Backend & APIs",
    description:
      "Power everything behind the screen. Understand server-side development, databases, authentication, API design, and application architecture.",
    ctaText: "Explore Backend",
    slug: "backend",
    imageUrl: domainInfra,
    gradient: "purple",
  },
  {
    badgeText: "Domain 04",
    badgeColor: "var(--pillar-o2)",
    title: "Blockchain",
    description:
      "Explore decentralized technology. Learn how blockchains work, understand smart contracts, and experiment with decentralized applications.",
    ctaText: "Explore Blockchain",
    slug: "blockchain",
    imageUrl: domainInfra,
    gradient: "green",
  },
  {
    badgeText: "Domain 05",
    badgeColor: "var(--primary)",
    title: "Cybersecurity",
    description:
      "Think like an attacker. Build like a defender. Explore ethical hacking, network security, cryptography, and secure development practices.",
    ctaText: "Explore Cybersecurity",
    slug: "cybersecurity",
    imageUrl: domainInfra,
    gradient: "orange",
  },
  {
    badgeText: "Domain 06",
    badgeColor: "var(--pillar-o1)",
    title: "DevOps & Infrastructure",
    description:
      "Build it. Deploy it. Keep it running. Understand how modern applications are deployed, monitored, and maintained.",
    ctaText: "Explore DevOps",
    slug: "devops",
    imageUrl: domainWeb,
    gradient: "gray",
  },
  {
    badgeText: "Domain 07",
    badgeColor: "var(--pillar-m)",
    title: "DSA & Problem Solving",
    description:
      "Strengthen the way you think. Develop logical thinking, algorithmic problem-solving, and coding skills through regular practice.",
    ctaText: "Explore DSA",
    slug: "dsa",
    imageUrl: domainWeb,
    gradient: "purple",
  },
  {
    badgeText: "Domain 08",
    badgeColor: "var(--pillar-o2)",
    title: "Embedded Systems & Hardware",
    description:
      "Bring ideas into the physical world. Combine software and electronics to create interactive hardware projects and intelligent devices.",
    ctaText: "Explore Hardware",
    slug: "embedded",
    imageUrl: domainAi,
    gradient: "green",
  },
];

const nonTechnicalDomains = [
  {
    badgeText: "Domain 09",
    badgeColor: "var(--pillar-o2)",
    title: "Design",
    description:
      "Give ideas a visual identity. Shape how L.O.O.M. looks, feels, and communicates through thoughtful visual design.",
    ctaText: "Explore Design",
    slug: "design",
    imageUrl: domainCreative,
    gradient: "green",
  },
  {
    badgeText: "Domain 10",
    badgeColor: "var(--pillar-m)",
    title: "PR & Outreach",
    description:
      "Connect ideas with people. Build the society's presence, tell its stories, and strengthen connections with students and external communities.",
    ctaText: "Explore PR & Outreach",
    slug: "pr_outreach",
    imageUrl: domainCreative,
    gradient: "purple",
  },
  {
    badgeText: "Domain 11",
    badgeColor: "var(--primary)",
    title: "Sponsorship & Event Management",
    description:
      "Turn plans into experiences. Work behind the scenes to organize events, manage resources, and create opportunities for the community.",
    ctaText: "Explore Sponsorship & EVM",
    slug: "sponsorship_evm",
    imageUrl: domainCreative,
    gradient: "orange",
  },
];

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
  const catalogue = [...technicalDomains, ...nonTechnicalDomains];
  const departments = catalogue.map((card, i) => ({
    ...card,
    name: card.title,
    vertical: i < technicalDomains.length ? "technical" : "non_technical",
    ctaHref: `/domains/${card.slug}`,
  }));
  const technicalCards = departments.filter(
    (card) => card.vertical === "technical",
  );
  const nonTechnicalCards = departments.filter(
    (card) => card.vertical === "non_technical",
  );
  return (
    <>
      <main
        id="main"
        className="loom-domains min-h-screen bg-background bg-grid text-foreground"
      >
        <JsonLd
          data={itemListSchema({
            name: "L.O.O.M. departments",
            items: departments.map((d) => ({
              name: d.name,
              url: absoluteUrl(`/domains/${d.slug}`),
            })),
          })}
        />
        <div >
          {/* Hero */}
          <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-8 sm:pt-28">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-primary">
              L.O.O.M.
            </p>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
              Choose your{" "}
              <span className="font-serif font-normal italic text-primary">
                domain.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              From artificial intelligence to design, from writing code to
              organizing events, every domain at L.O.O.M. offers a different way
              to explore, create, and contribute.
            </p>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Choose what interests you. Explore multiple fields. Discover where
              your skills can grow.
            </p>
            <p className="mt-8 inline-flex rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80">
              {technicalCards.length} Technical Domains ·{" "}
              {nonTechnicalCards.length} Non-Technical Domains
            </p>
          </section>

          {/* Thread 01 — Technical Domains */}
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
                title="Technical Domains"
                subtitle="Explore. Experiment. Engineer."
              />
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-10">
                {technicalCards.length === 0 && (
                  <p className="text-muted-foreground">
                    No technical domains published yet. Check back soon.
                  </p>
                )}
                {technicalCards.map((domain) => (
                  <GradientCard key={domain.title} {...domain} />
                ))}
              </div>
            </div>
          </section>

          {/* Thread 02 — Non-Technical Domains */}
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
                title="Non-Technical Domains"
                subtitle="Great technology needs more than code."
              />
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-10">
                {nonTechnicalCards.length === 0 && (
                  <p className="text-muted-foreground">
                    No non-technical domains published yet. Check back soon.
                  </p>
                )}
                {nonTechnicalCards.map((domain) => (
                  <GradientCard key={domain.title} {...domain} />
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
