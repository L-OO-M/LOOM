import Link from "next/link";
import { PublicInformationPage } from "@/components/landing/PublicInformationPage";
import { JsonLd, webPageSchema } from "@/components/seo/JsonLd";
import { canonicalFor } from "@/lib/seo";
import { legalConfig } from "@/lib/legal";

// This page has no database, tenant, or request input of its own, but it is
// rendered per request: the nonce-based CSP in middleware.js only stamps the
// inline bootstrap scripts on dynamically rendered HTML. Prerendering it would
// ship scripts with no nonce, and the browser would block them.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Disclaimer",
  description:
    "What LOOM's content is and is not: general information, not professional advice; no guaranteed outcomes; external links, affiliate content, availability and liability.",
  ...canonicalFor("/disclaimer"),
  openGraph: {
    title: "Disclaimer | LOOM",
    description:
      "General information only, no professional advice, no guaranteed outcomes, and the limits of our liability."
  }
};

const SECTIONS = [
  { id: "general-information", title: "General information only" },
  { id: "no-professional-advice", title: "No professional advice" },
  { id: "external-links", title: "External links" },
  { id: "affiliate-and-sponsored", title: "Affiliate and sponsored content" },
  { id: "results-and-testimonials", title: "Results and testimonials" },
  { id: "availability", title: "Website availability" },
  { id: "liability", title: "Limitation of liability" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" }
];

const H2 = "font-display mt-10 text-2xl font-medium sm:text-3xl";
const P = "mt-3 text-sm leading-7";
const UL = "mt-3 list-disc space-y-2 pl-5 text-sm leading-7";

export default function DisclaimerPage() {
  const legal = legalConfig();
  const contact = legal.contactEmail
    ? `${legal.contactName} (${legal.contactEmail})`
    : `${legal.contactName} through the contact page`;

  return (
    <PublicInformationPage
      kicker="Disclaimer"
      title="Disclaimer."
      lede="What this site's content is and is not: general information, not professional advice, with no guaranteed outcome."
      published={legal.published}
      sections={SECTIONS}
    >
      <JsonLd
        data={webPageSchema({
          name: "Disclaimer",
          path: "/disclaimer",
          description:
            "General information only, no professional advice, no guaranteed outcomes, and the limits of our liability."
        })}
      />

      <section className="information-article" aria-label="Disclaimer">
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          This Disclaimer applies to {legal.website} (the &ldquo;Website&rdquo;), operated by{" "}
          {legal.operatorName}. By using the Website you accept this Disclaimer in full. If you do not agree with
          any part of it, you must not use the Website. It should be read with our{" "}
          <Link prefetch={false} href="/terms" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Terms
          </Link>{" "}
          and{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy Policy
          </Link>
          .
        </p>

        <h2 id="general-information" className={H2} style={{ color: "var(--text)" }}>
          General information only
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          The information and materials on the Website are provided for general informational and educational
          purposes only. While we make reasonable efforts to keep them accurate and up to date, we make no
          representation or warranty, express or implied, as to their completeness, accuracy, reliability,
          suitability or availability. Any reliance you place on such information is strictly at your own risk.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          The same applies to member-submitted content: a project, snippet, answer or roadmap entry is one
          member&rsquo;s work, not a verified statement of fact.
        </p>

        <h2 id="no-professional-advice" className={H2} style={{ color: "var(--text)" }}>
          No professional advice
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Nothing on the Website constitutes legal, financial, tax, medical or other professional advice, or
          creates any professional-client relationship between you and us. You should seek independent advice
          from a qualified professional before acting or refraining from acting on the basis of anything on the
          Website.
        </p>

        <h2 id="external-links" className={H2} style={{ color: "var(--text)" }}>
          External links
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          The Website may contain links to external websites and resources &mdash; for example GitHub
          repositories, problem sets, documentation or developer profiles &mdash; that are not provided or
          maintained by us. We do not guarantee the accuracy, relevance, timeliness or completeness of any
          information on those sites, and the inclusion of a link does not imply endorsement.
        </p>

        <h2 id="affiliate-and-sponsored" className={H2} style={{ color: "var(--text)" }}>
          Affiliate and sponsored content
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Some links on the Website may be affiliate links. If you click such a link and make a purchase, we may
          receive a commission at no additional cost to you. Sponsored or paid content, where published, is
          clearly identified as such. This deployment currently publishes no affiliate links and no sponsored
          content.
        </p>

        <h2 id="results-and-testimonials" className={H2} style={{ color: "var(--text)" }}>
          Results and testimonials
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Any examples, results or testimonials presented on the Website are for illustration only and are not a
          guarantee of any outcome. Individual results will vary. Progress, ranking and proof surfaces show
          recorded evidence &mdash; what a machine verified or a chapter approved &mdash; not a prediction of
          employment, admission, academic credit or any other result. Where there is no data, the Website shows
          an honest empty state rather than an example number.
        </p>

        <h2 id="availability" className={H2} style={{ color: "var(--text)" }}>
          Website availability
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We do not guarantee that the Website will be available at all times, or that it will be free from
          errors, viruses or other harmful components. We may suspend, withdraw or restrict access to the Website
          without notice for maintenance, safety, abuse prevention or operational reasons.
        </p>

        <h2 id="liability" className={H2} style={{ color: "var(--text)" }}>
          Limitation of liability
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, WE SHALL NOT BE LIABLE FOR ANY LOSS OR DAMAGE OF ANY
          KIND, INCLUDING INDIRECT OR CONSEQUENTIAL LOSS, OR ANY LOSS OF DATA OR PROFITS, ARISING OUT OF OR IN
          CONNECTION WITH THE USE OF, OR RELIANCE ON, THE WEBSITE OR ITS CONTENT. Nothing in this Disclaimer
          excludes or limits liability that cannot be excluded or limited under Applicable Law.
        </p>

        <h2 id="changes" className={H2} style={{ color: "var(--text)" }}>
          Changes
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We may amend this Disclaimer at any time by posting the revised version on this page with an updated
          effective date.
        </p>

        <h2 id="contact" className={H2} style={{ color: "var(--text)" }}>
          Contact
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Questions about this Disclaimer may be sent to {contact}.
        </p>

        <p className="mt-10 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Related:{" "}
          <Link prefetch={false} href="/terms" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Terms
          </Link>{" "}
          ·{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy
          </Link>{" "}
          ·{" "}
          <Link prefetch={false} href="/cookies" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Cookies
          </Link>{" "}
          ·{" "}
          <Link prefetch={false} href="/contact" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Contact
          </Link>
        </p>
      </section>
    </PublicInformationPage>
  );
}
