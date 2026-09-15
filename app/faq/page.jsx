import Link from "next/link";
import { headers } from "next/headers";
import { getSql, queryTenant } from "@/lib/db";
import { resolveTenantFromHost } from "@/lib/tenant";
import { PublicNav } from "@/components/landing/PublicNav";
import { PageHero } from "@/components/landing/PageHero";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { JsonLd, faqPageSchema } from "@/components/seo/JsonLd";
import { canonicalFor } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FAQ",
  description: "How joining L.O.O.M. works, who it is for, and what happens after you sign up — straight answers, no invented fine print.",
  ...canonicalFor("/faq"),
  openGraph: {
    title: "FAQ | L.O.O.M.",
    description: "How joining works, who it is for, and what happens after you sign up."
  }
};

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
    <main className="w-full max-w-full overflow-x-hidden">
      <JsonLd data={faqPageSchema(faqs)} />
      <PublicNav />
      <div className="pt-16">
        <PageHero
          kicker="Questions, answered honestly"
          title="Frequently asked questions"
          lede="How joining works, who it is for, and what happens after you sign up. Still stuck? Create an account and ask in the community."
        />
      </div>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20" aria-label="Questions">
        <p className="kicker">Thread 01 — Straight answers</p>
        <div className="mt-6">
          {faqs.map((f, i) => (
            <details key={f.slug} className="group border-b py-6 first:border-t" style={{ borderColor: "var(--line)" }}>
              <summary className="flex cursor-pointer list-none items-baseline gap-4 outline-none focus-visible:underline [&::-webkit-details-marker]:hidden">
                <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display flex-1 text-xl font-medium sm:text-2xl" style={{ color: "var(--text)" }}>{f.question}</span>
                <span className="text-sm font-semibold transition group-open:rotate-45" style={{ color: "var(--accent)" }} aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 max-w-2xl pl-8 text-sm leading-7 sm:pl-10" style={{ color: "var(--text-muted)" }}>{f.answer}</p>
            </details>
          ))}
          {faqs.length === 0 && (
            <div className="rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="text-base font-medium" style={{ color: "var(--text)" }}>No FAQs published yet.</p>
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

        <div className="mt-12 rounded-2xl border p-6 text-center sm:p-8" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
          <p className="font-display text-2xl font-medium" style={{ color: "var(--text)" }}>Your question not here?</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Joining is approval-free. Create an account, pick your domains, and ask anything in the community.
          </p>
          <Link href="/register" prefetch={false} className="btn-ink mt-5">Create an account</Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
