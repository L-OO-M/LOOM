import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { listPublicDepartments } from "@/lib/departments";
import { resolveTenantFromHost } from "@/lib/tenant";
import { PublicNav } from "@/components/landing/PublicNav";
import { PageHero } from "@/components/landing/PageHero";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { JsonLd, aboutPageSchema } from "@/components/seo/JsonLd";
import { HeadBylines } from "@/components/landing/HeadBylines";
import { SITE_DESCRIPTION, canonicalFor } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "About",
  description: "What L.O.O.M. is: a beginner-first developer loop — learn, practice, build, collaborate, mentor — run by student departments, measured on accessibility, readiness, excellence, and network.",
  ...canonicalFor("/about"),
  openGraph: {
    title: "About | L.O.O.M.",
    description: SITE_DESCRIPTION
  }
};

const THESIS = [
  ["Accessibility", "Traditional societies leave beginners out.", "Strictly beginner-friendly participation and onboarding."],
  ["Guidance", "Fragmented resources without a path.", "Structured roadmaps plus peer-to-peer mentorship."],
  ["Engagement", "Recruit once, fade by mid-semester.", "Consistent year-round practice and hands-on projects."],
  ["Output", "Certificates in drawers.", "Open-source contribution, hackathons, collaboration."]
];

// Membership levels. This used to live on /login and /register, where it buried
// the actual sign-in form under five cards. It belongs on the page people read
// BEFORE they have an account, so it moved here intact.
const LEVELS = [
  {
    name: "General",
    tag: "Everyone starts here",
    body: "Register, join any domain instantly, attend workshops, ship projects. No approval, no interview.",
    how: "Just register."
  },
  {
    name: "Core",
    tag: "Proven contributors",
    body: "Self-log work, volunteer at events, see your department roster. Granted by your Head after steady work.",
    how: "Join a domain → request Core from your dashboard."
  },
  {
    name: "Head / Co-Head",
    tag: "Department drivers",
    body: "Run a department: roster, workshops, contribution logs, monthly reports. Both share equal power.",
    how: "Appointed by a Super Admin."
  },
  {
    name: "Vertical Lead",
    tag: "Technical / Non-Technical",
    body: "Coordinate departments in one vertical: calendars, approvals, documentation, succession.",
    how: "Appointed by a Super Admin."
  },
  {
    name: "Super Admin",
    tag: "President, VP, Gen Sec",
    body: "Everything: roles, departments, budgets, reports, handover. The society's root of trust.",
    how: "Claimed once at /setup."
  }
];

async function resolvePublicTenant() {
  try {
    const host = (await headers()).get("host") || "";
    const t = await resolveTenantFromHost(host);
    if (t) return t;
  } catch { /* fall through to default tenant */ }
  try {
    return await queryTenant(process.env.DEV_TENANT_SLUG || "demo-college");
  } catch {
    return null;
  }
}

export default async function AboutPage() {
  const tenant = await resolvePublicTenant();
  const tid = tenant?.id ?? null;
  const sql = getSql();
  let leadership = [];
  try {
    leadership = await listPublicDepartments(sql, { tenantId: tid });
  } catch {
    leadership = [];
  }

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <JsonLd data={aboutPageSchema()} />
      <PublicNav />
      <div className="pt-16">
        <PageHero
          kicker="What L.O.O.M. is"
          title="About L.O.O.M."
          lede="Learning, Opportunity, Open Source, Mentorship — a self-sustaining, student-run technical learning community. An ecosystem, not an event organizer."
        />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20" aria-label="The vision">
        <p className="kicker">Thread 01 — The vision</p>
        <h2 className="font-display mt-4 max-w-2xl text-3xl font-medium sm:text-4xl" style={{ color: "var(--text)" }}>
          Built to do the opposite.
        </h2>
        <div className="mt-8 divide-y" style={{ borderColor: "var(--line)" }}>
          {THESIS.map(([title, oldWay, loomWay]) => (
            <div key={title} className="grid gap-2 py-6 sm:grid-cols-[180px_1fr_1fr] sm:items-baseline">
              <h3 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>{title}</h3>
              <p className="text-sm leading-6 line-through decoration-2" style={{ color: "var(--text-muted)", textDecorationColor: "rgba(180,60,50,0.5)" }}>{oldWay}</p>
              <p className="text-sm font-medium leading-6" style={{ color: "var(--text)" }}>{loomWay}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y px-5 py-16 lg:px-8 lg:py-20" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }} aria-label="Leadership">
        <div className="mx-auto max-w-7xl">
          <p className="kicker">Thread 02 — The people holding it</p>
          <h2 className="font-display mt-4 max-w-2xl text-3xl font-medium sm:text-4xl" style={{ color: "var(--text)" }}>
            Leadership, from the roster.
          </h2>
          <p className="mt-4 max-w-xl leading-7" style={{ color: "var(--text-muted)" }}>
            The students currently responsible for each department — names come straight from the chapter roster, never a static list.
          </p>
          {leadership.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {leadership.map((d) => (
                <li key={d.slug} className="spot-card rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>{d.vertical}</p>
                  <Link prefetch={false} href={`/domains/${d.slug}`} className="font-display mt-2 flex min-h-[44px] items-center text-xl font-medium hover:underline" style={{ color: "var(--text)" }}>
                    {d.name}
                  </Link>
                  <HeadBylines head={{ name: d.head_name, photo: d.head_avatar }} coHead={{ name: d.co_head_name, photo: d.co_head_avatar }} />
                  <p className="meta mt-3">{d.members} member{d.members === 1 ? "" : "s"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-8 max-w-2xl rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="text-base font-medium" style={{ color: "var(--text)" }}>Leadership is not published yet.</p>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                No active departments have named heads right now. This updates automatically once the chapter assigns them.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20" aria-label="Membership levels">
        <p className="kicker">Thread 03 — Five levels, one login</p>
        <h2 className="font-display mt-4 max-w-2xl text-3xl font-medium sm:text-4xl" style={{ color: "var(--text)" }}>
          Where do you fit?
        </h2>
        <p className="mt-4 max-w-xl leading-7" style={{ color: "var(--text-muted)" }}>
          Access is earned or granted — never self-selected. The same login serves every
          level; the server decides what it can reach.
        </p>
        <ol className="mt-8 divide-y" style={{ borderColor: "var(--line)" }}>
          {LEVELS.map((l, i) => (
            <li key={l.name} className="grid gap-x-6 gap-y-2 py-6 sm:grid-cols-[64px_1fr_minmax(0,320px)] sm:items-baseline">
              <span className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>{l.name}</h3>
                  <span className="meta">{l.tag}</span>
                </div>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{l.body}</p>
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{l.how}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 text-center sm:px-6 lg:px-8" aria-label="Join">
        <p className="kicker">Thread 04 — Enter</p>
        <h2 className="font-display mx-auto mt-4 max-w-2xl text-3xl font-medium sm:text-4xl" style={{ color: "var(--text)" }}>
          No prior skill required — bring your questions.
        </h2>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/register" prefetch={false} className="btn-ink justify-center !px-6 !py-3 !text-base">Start your journey</Link>
          <Link href="/events" prefetch={false} className="justify-center !px-6 !py-3 !text-base font-semibold transition hover:opacity-85" style={{ color: "var(--text)", border: "1px solid var(--line)", borderRadius: 10 }}>
            See what&apos;s on
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
