import Link from "next/link";
import { PublicInformationPage } from "@/components/landing/PublicInformationPage";
import { JsonLd, webPageSchema } from "@/components/seo/JsonLd";
import { canonicalFor } from "@/lib/seo";

// Pure static legal/contact copy: no database, no tenant, no request input.
// Safe to serve from the CDN cache. The tenant-scoped public pages (/events,
// /domains, /faq, /about) MUST stay dynamic -- they resolve their chapter from
// the Host header, and a shared cache keyed by path would serve one chapter's
// content to another.
export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata = {
  title: "Contact",
  description:
    "How to contact the L.O.O.M. chapter responsible for an account, privacy request, credential question, or safety report. Public contact details are pending publication.",
  ...canonicalFor("/contact"),
  openGraph: {
    title: "Contact | L.O.O.M.",
    description: "Contact the responsible L.O.O.M. chapter about accounts, privacy, credentials, or safety."
  }
};

const PLACEHOLDERS = {
  contactName: "[CHAPTER_CONTACT_NAME]",
  contactEmail: "[CHAPTER_CONTACT_EMAIL]",
  published: "2026-10-15"
};

export default function ContactPage() {
  return (
    <PublicInformationPage
      kicker="Contact"
      title="Contact the chapter."
      lede="Use the responsible chapter contact for accounts, privacy requests, credential questions, safety reports, and legal notices. Public contact details are pending publication."
      published={PLACEHOLDERS.published}
      sections={[{"id": "responsible-contact", "title": "Responsible contact"}, {"id": "what-to-include", "title": "What to include"}, {"id": "urgent-safety-matters", "title": "Urgent safety matters"}]}
    >
      <JsonLd
        data={webPageSchema({
          name: "Contact",
          path: "/contact",
          description: "Contact the responsible L.O.O.M. chapter about accounts, privacy, credentials, or safety."
        })}
      />

      <section className="information-article" aria-label="Contact">
        <h2 id="responsible-contact" className="font-display mt-8 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Responsible contact
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          {PLACEHOLDERS.contactName} · {PLACEHOLDERS.contactEmail}
        </p>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          The chapter has not yet published its public contact name and address on this page. The placeholders above
          must be replaced before this page is treated as operational. Signed-in members can also use their chapter’s
          published community and notification channels.
        </p>

        <h2 id="what-to-include" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          What to include
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          <li>The affected account name, username, event, credential ID, or report, where applicable.</li>
          <li>The date, page, and exact text or behavior observed.</li>
          <li>Whether the request concerns privacy, safety, moderation, finance, credentials, or legal notice.</li>
          <li>A reply address the chapter is permitted to use.</li>
        </ul>

        <h2 id="urgent-safety-matters" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Urgent safety matters
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          For an urgent safety matter, use the college’s published emergency or grievance channel in addition to
          contacting the chapter. This page does not monitor emergencies continuously.
        </p>

        <p className="mt-10 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Related:{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy
          </Link>{" "}
          ·{" "}
          <Link prefetch={false} href="/terms" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Terms
          </Link>{" "}
          ·{" "}
          <Link prefetch={false} href="/about" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            About
          </Link>
        </p>
      </section>

    </PublicInformationPage>
  );
}
