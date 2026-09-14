import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { PublicNav } from "@/components/landing/PublicNav";
import { PageHero } from "@/components/landing/PageHero";
import { PublicFooter } from "@/components/landing/PublicFooter";

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

export default async function DomainsPage() {
  const tenant = await resolvePublicTenant();
  const tid = tenant?.id ?? null;
  const sql = getSql();
  let departments = [];
  try {
    departments = await sql`
      SELECT d.name, d.slug, d.vertical, d.description,
             hp.name AS head_name, cp.name AS co_head_name,
             (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members,
             (SELECT COUNT(*)::int FROM events e WHERE e.department_id = d.id AND e.starts_at >= NOW() AND e.status <> 'cancelled') AS upcoming
      FROM departments d
      LEFT JOIN profiles hp ON hp.user_id = d.head_user_id
      LEFT JOIN profiles cp ON cp.user_id = d.co_head_user_id
      WHERE (d.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
        AND d.is_active
      ORDER BY d.vertical, d.name
    `;
  } catch {
    departments = [];
  }

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <PublicNav />
      <div className="pt-16">
        <PageHero
          kicker="Five tracks, one loop"
          title="Choose your domain."
          lede="Every department is a door with the same handle: zero assumed knowledge, a real roadmap, seniors who remember the first step. Open one — or several."
        />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20" aria-label="Departments">
        <p className="kicker">Thread 01 — The doors</p>
        {departments.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d, i) => (
              <li key={d.slug}>
                <Link prefetch={false} href={`/domains/${d.slug}`} className="spot-card group block h-full rounded-2xl border p-6 transition hover:-translate-y-1" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
                    {String(i + 1).padStart(2, "0")} · {d.vertical}
                  </p>
                  <h2 className="font-display mt-2 text-2xl font-medium group-hover:underline" style={{ color: "var(--text)" }}>{d.name}</h2>
                  {d.description && <p className="mt-2 line-clamp-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{d.description}</p>}
                  <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    {d.head_name ? `Head: ${d.head_name}` : "Head: — not assigned yet"}
                  </p>
                  <p className="mt-3 font-mono text-sm" style={{ color: "var(--text)" }}>
                    {d.members} <span className="font-sans text-xs" style={{ color: "var(--text-muted)" }}>
                      member{d.members === 1 ? "" : "s"}{d.upcoming > 0 ? ` · ${d.upcoming} upcoming` : ""}
                    </span>
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold transition group-hover:gap-2" style={{ color: "var(--accent)" }}>
                    Open the door →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 max-w-2xl rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-base font-medium" style={{ color: "var(--text)" }}>No domains published yet.</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              The chapter has not staffed its departments. Check back soon — the doors appear here the moment they open.
            </p>
          </div>
        )}

        <div className="mt-12 rounded-2xl border p-6 text-center sm:p-8" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
          <p className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>Joining is instant — no approval, no interview.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Pick one domain or all five. Membership starts the moment you sign up.
          </p>
          <Link href="/register" prefetch={false} className="btn-ink mt-5">Create an account</Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
