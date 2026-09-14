import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { PublicNav } from "@/components/landing/PublicNav";
import { PageHero } from "@/components/landing/PageHero";
import { PublicFooter } from "@/components/landing/PublicFooter";

export const dynamic = "force-dynamic";

const THESIS = [
  ["Accessibility", "Traditional societies leave beginners out.", "Strictly beginner-friendly participation and onboarding."],
  ["Guidance", "Fragmented resources without a path.", "Structured roadmaps plus peer-to-peer mentorship."],
  ["Engagement", "Recruit once, fade by mid-semester.", "Consistent year-round practice and hands-on projects."],
  ["Output", "Certificates in drawers.", "Open-source contribution, hackathons, collaboration."]
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
    leadership = await sql`
      SELECT d.name, d.slug, d.vertical, d.description,
             hp.name AS head_name, cp.name AS co_head_name,
             (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members
      FROM departments d
      LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
      LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
      WHERE (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
        AND d.is_active
      ORDER BY d.vertical, d.name
    `;
  } catch {
    leadership = [];
  }

  return (
    <main className="w-full max-w-full overflow-x-hidden">
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
                  <Link prefetch={false} href={`/domains/${d.slug}`} className="font-display mt-2 block text-xl font-medium hover:underline" style={{ color: "var(--text)" }}>
                    {d.name}
                  </Link>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    Head: <strong style={{ color: "var(--text)" }}>{d.head_name || "— not assigned yet"}</strong>
                    {" · "}Co-Head: <strong style={{ color: "var(--text)" }}>{d.co_head_name || "— not assigned yet"}</strong>
                  </p>
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

      <section className="mx-auto max-w-7xl px-5 py-16 text-center sm:px-6 lg:px-8" aria-label="Join">
        <p className="kicker">Thread 03 — Enter</p>
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
