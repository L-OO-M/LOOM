import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <BrandMark size={28} />
      <p className="kicker mt-8">What L.O.O.M. is</p>
      <h1 className="font-display mt-2 text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
        About L.O.O.M.
      </h1>
      <p className="mt-4 leading-7" style={{ color: "var(--text-muted)" }}>
        L.O.O.M. — Learning, Opportunity, Open Source, Mentorship — is a self-sustaining,
        student-run technical learning community. It is an ecosystem, not an event organizer:
        a place where students learn, build, and grow regardless of prior experience, until
        they become the mentors of the next intake.
      </p>

      <h2 className="font-display mt-10 text-2xl font-medium" style={{ color: "var(--text)" }}>The vision</h2>
      <div className="mt-4 space-y-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        <p>Traditional societies recruit, host a few events, hand out certificates, and fade. L.O.O.M. is built to do the opposite:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong style={{ color: "var(--text)" }}>Accessibility</strong> — strictly beginner-friendly participation and onboarding.</li>
          <li><strong style={{ color: "var(--text)" }}>Guidance</strong> — structured roadmaps plus peer-to-peer mentorship.</li>
          <li><strong style={{ color: "var(--text)" }}>Engagement</strong> — consistent year-round practice and hands-on projects.</li>
          <li><strong style={{ color: "var(--text)" }}>Output</strong> — open-source contribution, hackathons, and collaboration.</li>
        </ul>
        <p>Students Learn → Students Build → Students Mentor → Students Contribute. No prior skill required — bring your questions.</p>
      </div>

      <h2 className="font-display mt-10 text-2xl font-medium" style={{ color: "var(--text)" }}>Leadership</h2>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        The students currently responsible for each department — names come straight from the chapter roster.
      </p>
      <div className="mt-4 space-y-3">
        {leadership.map((d) => (
          <article key={d.slug} className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link prefetch={false} href={`/domains/${d.slug}`} className="text-base font-medium" style={{ color: "var(--text)" }}>
                {d.name}
              </Link>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{d.members} member{d.members === 1 ? "" : "s"}</span>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Head: {d.head_name || "— not assigned yet"} · Co-Head: {d.co_head_name || "— not assigned yet"}
            </p>
          </article>
        ))}
        {leadership.length === 0 && (
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Leadership is not published yet.</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              No active departments have named heads right now. This updates automatically once the chapter assigns them.
            </p>
          </div>
        )}
      </div>

      <nav className="mt-10 flex flex-wrap gap-4 text-sm font-medium" aria-label="Public pages">
        <Link prefetch={false} href="/" style={{ color: "var(--accent)" }}>← Home</Link>
        <Link prefetch={false} href="/faq" style={{ color: "var(--accent)" }}>FAQ</Link>
        <Link prefetch={false} href="/events" style={{ color: "var(--accent)" }}>Events</Link>
      </nav>
    </main>
  );
}
