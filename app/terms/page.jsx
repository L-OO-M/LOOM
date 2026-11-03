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
  title: "Terms",
  description:
    "The rules for LOOM accounts, acceptable use, submitted work, moderation, credentials, availability, and changes.",
  ...canonicalFor("/terms"),
  openGraph: {
    title: "Terms | LOOM",
    description: "Account rules, acceptable use, submitted work, moderation, credentials, and service changes."
  }
};

export default function TermsPage() {
  const legal = legalConfig();
  const contact = legal.contactEmail
    ? `${legal.contactName} (${legal.contactEmail})`
    : `${legal.contactName} through the contact page`;

  return (
    <PublicInformationPage
      kicker="Terms"
      title="Terms of use."
      lede="The rules for accounts, acceptable conduct, submitted work, moderation, credentials, availability, and changes."
      published={legal.published}
      sections={[{"id": "agreement", "title": "Agreement"}, {"id": "eligibility-and-accounts", "title": "Eligibility and accounts"}, {"id": "acceptable-use", "title": "Acceptable use"}, {"id": "submitted-work-and-moderation", "title": "Submitted work and moderation"}, {"id": "credentials-and-verification", "title": "Credentials and verification"}, {"id": "availability-changes-and-termination", "title": "Availability, changes, and termination"}, {"id": "no-warranty-and-liability", "title": "No warranty and limitation of liability"}, {"id": "governing-terms", "title": "Governing terms"}]}
    >
      <JsonLd
        data={webPageSchema({
          name: "Terms",
          path: "/terms",
          description: "Account rules, acceptable use, submitted work, moderation, credentials, and service changes."
        })}
      />

      <section className="information-article" aria-label="Terms of use">
        <h2 id="agreement" className="font-display mt-8 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Agreement
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          By creating an account or signing in, a member agrees to these terms with {legal.operatorName}.
          Questions about these terms can be sent to {contact}. This page describes the service&apos;s operating
          rules; it is not legal advice.
        </p>

        <h2 id="eligibility-and-accounts" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Eligibility and accounts
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          <li>Accounts are for members of a participating college chapter.</li>
          <li>Members must provide accurate identity and chapter information.</li>
          <li>Members are responsible for activity under their credentials and for signing out from shared devices.</li>
          <li>Roles are granted by chapter administrators and leads; they are not self-selected.</li>
        </ul>

        <h2 id="acceptable-use" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Acceptable use
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          <li>No spam, harassment, abuse, unlawful conduct, or interference with the service.</li>
          <li>No false proof, misattributed work, manipulated activity, credential forgery, or misleading endorsements.</li>
          <li>No attempt to bypass authentication, authorization, tenant isolation, rate limits, audit logging, or moderation controls.</li>
          <li>No submission of content the member does not have the right to share.</li>
        </ul>

        <h2 id="submitted-work-and-moderation" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Submitted work and moderation
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Members retain ownership of work they submit, subject to licenses already granted to third-party repositories
          or publishers. By submitting material to LOOM, the member permits the chapter to display, organize,
          review, verify, moderate, hide, or remove that material for operating the service. Moderation flags are
          community signals; chapter administrators make the final decision.
        </p>

        <h2 id="credentials-and-verification" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Credentials and verification
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Badges, achievements, certificates, and verifiable credentials are issued only through chapter workflows.
          Public verification establishes that a credential record exists and has the displayed status; it does not
          independently guarantee employment readiness, academic credit, or third-party acceptance.
        </p>

        <h2 id="availability-changes-and-termination" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Availability, changes, and termination
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          <li>The chapter may change, suspend, or discontinue features for safety, maintenance, abuse prevention, or operational reasons.</li>
          <li>Accounts or content violating these terms may be restricted, suspended, or removed, with administrative audit where applicable.</li>
          <li>Material changes will be published here with an updated publication date.</li>
        </ul>

        <h2 id="no-warranty-and-liability" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          No warranty and limitation of liability
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          To the maximum extent permitted by applicable law, the service is provided &ldquo;as is&rdquo; and
          &ldquo;as available&rdquo; without warranties of any kind, whether express or implied, including
          fitness for a particular purpose, accuracy of member-submitted content, or uninterrupted
          availability. The operator is not liable for indirect, incidental, special, consequential,
          exemplary, or punitive damages, or for lost data, opportunities, or credentials, arising from
          use of or inability to use the service.
        </p>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Where liability cannot be excluded, the operator&rsquo;s total aggregate liability for all claims
          relating to the service is limited to {legal.liabilityCap}. Nothing in these terms excludes
          liability that applicable law does not permit to be excluded. Member-submitted work, external
          links, and third-party services remain the responsibility of the member or provider that supplied
          them.
        </p>

        <h2 id="governing-terms" className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Governing terms
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          These terms are governed by {legal.governingLaw}. A chapter may adopt additional local policies, but
          they do not replace these terms.
        </p>

        <p className="mt-10 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Related:{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy
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
