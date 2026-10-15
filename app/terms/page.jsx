import Link from "next/link";
import { PublicNav } from "@/components/landing/PublicNav";
import { PageHero } from "@/components/landing/PageHero";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { canonicalFor } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Terms",
  description:
    "The rules for L.O.O.M. accounts, acceptable use, submitted work, moderation, credentials, availability, and changes. Draft terms pending chapter review.",
  ...canonicalFor("/terms"),
  openGraph: {
    title: "Terms | L.O.O.M.",
    description: "Account rules, acceptable use, submitted work, moderation, credentials, and service changes."
  }
};

const PLACEHOLDERS = {
  legalEntity: "[LEGAL_ENTITY_NAME]",
  contact: "[TERMS_CONTACT]",
  governingLaw: "[GOVERNING_LAW_AND_VENUE]",
  published: "2026-10-15"
};

export default function TermsPage() {
  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <PublicNav />
      <div className="pt-16">
        <PageHero
          kicker="Terms"
          title="Terms of use."
          lede="The rules for accounts, acceptable conduct, submitted work, moderation, credentials, availability, and changes. These are draft terms pending chapter review."
        />
      </div>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20" aria-label="Terms of use">
        <p className="kicker">Published {PLACEHOLDERS.published} · chapter review pending</p>

        <h2 className="font-display mt-8 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Agreement
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          By creating an account or signing in, a member agrees to these terms with {PLACEHOLDERS.legalEntity}.
          Questions about these terms can be sent to {PLACEHOLDERS.contact}. This page is an operational policy draft,
          not legal advice.
        </p>

        <h2 className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Eligibility and accounts
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          <li>Accounts are for members of a participating college chapter.</li>
          <li>Members must provide accurate identity and chapter information.</li>
          <li>Members are responsible for activity under their credentials and for signing out from shared devices.</li>
          <li>Roles are granted by chapter administrators and leads; they are not self-selected.</li>
        </ul>

        <h2 className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Acceptable use
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          <li>No spam, harassment, abuse, unlawful conduct, or interference with the service.</li>
          <li>No false proof, misattributed work, manipulated activity, credential forgery, or misleading endorsements.</li>
          <li>No attempt to bypass authentication, authorization, tenant isolation, rate limits, audit logging, or moderation controls.</li>
          <li>No submission of content the member does not have the right to share.</li>
        </ul>

        <h2 className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Submitted work and moderation
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Members retain ownership of work they submit, subject to licenses already granted to third-party repositories
          or publishers. By submitting material to L.O.O.M., the member permits the chapter to display, organize,
          review, verify, moderate, hide, or remove that material for operating the service. Moderation flags are
          community signals; chapter administrators make the final decision.
        </p>

        <h2 className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Credentials and verification
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Badges, achievements, certificates, and verifiable credentials are issued only through chapter workflows.
          Public verification establishes that a credential record exists and has the displayed status; it does not
          independently guarantee employment readiness, academic credit, or third-party acceptance.
        </p>

        <h2 className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Availability, changes, and termination
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          <li>The chapter may change, suspend, or discontinue features for safety, maintenance, abuse prevention, or operational reasons.</li>
          <li>Accounts or content violating these terms may be restricted, suspended, or removed, with administrative audit where applicable.</li>
          <li>Material changes will be published here with an updated publication date.</li>
        </ul>

        <h2 className="font-display mt-10 text-2xl font-medium sm:text-3xl" style={{ color: "var(--text)" }}>
          Governing terms
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          These draft terms are governed by {PLACEHOLDERS.governingLaw}. The chapter must complete legal review before
          treating them as final.
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

      <PublicFooter />
    </main>
  );
}
