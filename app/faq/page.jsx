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

export default async function FaqPage() {
  const tenant = await resolvePublicTenant();
  const tid = tenant?.id ?? null;
  const sql = getSql();
  let faqs = [];
  try {
    faqs = await sql`
      SELECT slug, question, answer FROM faqs
      WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
        AND is_published
      ORDER BY sort_order ASC, created_at ASC
    `;
  } catch {
    faqs = [];
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <BrandMark size={28} />
      <p className="kicker mt-8">Questions, answered honestly</p>
      <h1 className="font-display mt-2 text-4xl font-medium sm:text-5xl" style={{ color: "var(--text)" }}>
        Frequently asked questions
      </h1>
      <p className="mt-4 leading-7" style={{ color: "var(--text-muted)" }}>
        How joining works, who it is for, and what happens after you sign up. Still stuck?{" "}
        <Link prefetch={false} href="/register" className="font-semibold" style={{ color: "var(--accent)" }}>
          Create an account
        </Link>{" "}
        and ask in the community.
      </p>
      <div className="mt-8 space-y-3">
        {faqs.map((f) => (
          <details key={f.slug} className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <summary className="cursor-pointer text-base font-medium" style={{ color: "var(--text)" }}>
              {f.question}
            </summary>
            <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{f.answer}</p>
          </details>
        ))}
        {faqs.length === 0 && (
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No FAQs published yet.</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              The chapter has not published its frequently asked questions. Check back soon — or{" "}
              <Link prefetch={false} href="/register" className="font-semibold" style={{ color: "var(--accent)" }}>
                create an account
              </Link>{" "}
              and ask directly.
            </p>
          </div>
        )}
      </div>
      <nav className="mt-10 flex flex-wrap gap-4 text-sm font-medium" aria-label="Public pages">
        <Link prefetch={false} href="/" style={{ color: "var(--accent)" }}>← Home</Link>
        <Link prefetch={false} href="/about" style={{ color: "var(--accent)" }}>About</Link>
        <Link prefetch={false} href="/events" style={{ color: "var(--accent)" }}>Events</Link>
      </nav>
    </main>
  );
}
