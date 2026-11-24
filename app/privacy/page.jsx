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
  title: "Privacy",
  description:
    "How LOOM collects, uses, stores, shares and protects personal data under the DPDP Act, 2023: categories, lawful basis, retention, your rights, and the Grievance Officer.",
  ...canonicalFor("/privacy"),
  openGraph: {
    title: "Privacy | LOOM",
    description:
      "What LOOM collects, why it is processed, who can see it, how long it is kept, and how to exercise your rights."
  }
};

const SECTIONS = [
  { id: "who-we-are", title: "Who we are" },
  { id: "data-we-collect", title: "Personal data we collect" },
  { id: "public-content", title: "Public content" },
  { id: "why-we-process", title: "Why we process it" },
  { id: "consent", title: "Consent and choices" },
  { id: "sharing", title: "Sharing and disclosure" },
  { id: "cross-border", title: "Cross-border transfers" },
  { id: "cookies", title: "Cookies and tracking" },
  { id: "retention", title: "Retention" },
  { id: "security", title: "Security and breaches" },
  { id: "rights", title: "Your rights" },
  { id: "children", title: "Children's data" },
  { id: "third-party-sites", title: "Third-party websites" },
  { id: "changes", title: "Changes" },
  { id: "grievance", title: "Grievance officer and contact" }
];

const H2 = "font-display mt-10 text-2xl font-medium sm:text-3xl";
const P = "mt-3 text-sm leading-7";
const UL = "mt-3 list-disc space-y-2 pl-5 text-sm leading-7";

export default function PrivacyPage() {
  const legal = legalConfig();
  const contact = legal.contactEmail
    ? `${legal.contactName} (${legal.contactEmail})`
    : `${legal.contactName} through the contact page`;
  const grievanceEmail = legal.grievanceEmail || legal.contactEmail;

  return (
    <PublicInformationPage
      kicker="Privacy"
      title="Privacy policy."
      lede="What LOOM collects, why it is processed, who can see it, how long it is kept, and how to exercise your rights under the DPDP Act, 2023."
      published={legal.published}
      sections={SECTIONS}
    >
      <JsonLd
        data={webPageSchema({
          name: "Privacy policy",
          path: "/privacy",
          description:
            "How LOOM collects, uses, stores, shares and protects personal data under the DPDP Act, 2023."
        })}
      />

      <section className="information-article" aria-label="Privacy policy">
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          This policy is prepared in accordance with the Digital Personal Data Protection Act, 2023
          (&ldquo;DPDP Act&rdquo;), the Information Technology Act, 2000 and the rules made under it and, where
          applicable, the EU/UK General Data Protection Regulation. It should be read with our{" "}
          <Link prefetch={false} href="/cookies" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Cookie Policy
          </Link>
          .
        </p>

        <h2 id="who-we-are" className={H2} style={{ color: "var(--text)" }}>
          Who we are
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          For the purposes of this policy, {legal.operatorName}, {legal.operatorAddress}, is the Data Fiduciary
          (and controller) of the personal data collected through {legal.website}. Privacy questions can be sent
          to {contact}. This page describes how the service handles data; it is not legal advice.
        </p>

        <h2 id="data-we-collect" className={H2} style={{ color: "var(--text)" }}>
          Personal data we collect
        </h2>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Identity and contact data</strong> &mdash; name, email
            address and phone number, collected directly from you through forms, sign-up or correspondence.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Account data</strong> &mdash; username, password (stored
            hashed), chapter profile such as roll number, branch, year and selected domains, the sign-in
            identity managed by the chapter&rsquo;s authentication provider (Auth0, or the legacy Supabase Auth
            fallback where enabled), links to developer profiles you choose to add, and preferences.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Content you provide</strong> &mdash; posts, code snippets,
            comments, messages, files, project links and feedback, plus learning and contribution records such
            as roadmap and resource progress, projects, contests, mentorship applications and sessions, forums,
            wiki contributions, events, credentials, achievements and reports.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Transaction data, if applicable</strong> &mdash; order
            details, billing address and payment status. Payments are processed by third-party providers; we do
            not store full card details.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Technical and usage data</strong> &mdash; IP address, browser
            type, device identifiers, pages viewed, time and date of visit, referring URL, authentication
            sessions, account-security events, in-app notifications, administrative audit records, and aggregated
            activity and cohort metrics used to operate chapters.
          </li>
        </ul>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We do not knowingly collect sensitive categories of data (such as health, financial account, biometric
          or government identification data) through the Website. Please do not send us such data.
        </p>

        <h2 id="public-content" className={H2} style={{ color: "var(--text)" }}>
          Public content
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Your profile, posts, code and comments may be visible to other members and the public, and may be
          indexed by search engines or copied by others. A profile, card or credential becomes public only when
          it is explicitly made public or shared; private chapter data is not published by default. Please do
          not post personal data that you do not want to be public. Content you have shared publicly may remain
          visible in copies outside our control even after you delete it from the Website.
        </p>

        <h2 id="why-we-process" className={H2} style={{ color: "var(--text)" }}>
          Why we process it
        </h2>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Providing and operating the Website and Services</strong>{" "}
            &mdash; accounts, chapter membership, roadmaps, resources, practice, events, mentorship and proof.{" "}
            <em>Basis: consent; performance of a contract.</em>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Responding to enquiries and support requests</strong>{" "}
            &mdash; <em>consent; legitimate interest.</em>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Processing payments and orders, if applicable</strong>{" "}
            &mdash; <em>performance of a contract; legal obligation.</em>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Sending newsletters or promotional messages</strong> &mdash;{" "}
            <em>consent, which you may withdraw at any time.</em>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Analytics and improving the Website</strong> &mdash;{" "}
            <em>legitimate interest in aggregated, first-party usage data, which you can turn off in Settings.</em>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Security, fraud prevention and abuse detection</strong>{" "}
            &mdash; <em>legitimate interest; legal obligation.</em>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Compliance with law and legal claims</strong> &mdash;{" "}
            <em>legal obligation.</em>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Attributing work and verifying credentials</strong> &mdash;
            <em>performance of a contract; consent where the proof is shared publicly.</em>
          </li>
        </ul>

        <h2 id="consent" className={H2} style={{ color: "var(--text)" }}>
          Consent and choices
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Where we rely on your consent, you may withdraw it at any time by contacting us or by using the
          unsubscribe or settings option provided. Withdrawal does not affect processing carried out before
          withdrawal. Where consent is required, we request it separately from the Terms through a clear notice
          describing the personal data, the purposes of processing, how you can withdraw consent or exercise your
          rights, and how you can complain to the Data Protection Board of India. Acceptance of the Terms alone is
          not consent to processing that requires it.
        </p>

        <h2 id="sharing" className={H2} style={{ color: "var(--text)" }}>
          Sharing and disclosure
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We do not sell your personal data. We may share it with:
        </p>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            (a) service providers and processors who process data on our behalf under written agreements, such as
            database and authentication hosting (Supabase), application hosting (Vercel), identity (Auth0, where
            configured), transactional email (Resend, where configured), and GitHub APIs used to verify linked
            accounts and contributions;
          </li>
          <li>(b) government authorities, courts or law enforcement where disclosure is required by Applicable Law or legal process;</li>
          <li>(c) professional advisers such as lawyers, auditors and insurers, where reasonably necessary;</li>
          <li>
            (d) a successor entity, in connection with a merger, acquisition or sale of our business, subject to
            this policy.
          </li>
        </ul>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Within a chapter, members, leads, mentors and administrators see operational records permitted by their
          role. Access is scoped by authenticated session, chapter membership, role and server-side chapter
          checks.
        </p>

        <h2 id="cross-border" className={H2} style={{ color: "var(--text)" }}>
          Cross-border transfers
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Your personal data may be stored or processed on servers located outside India. We transfer data only to
          countries and recipients not restricted by the Government of India under the DPDP Act, and we take
          reasonable steps to ensure that your data is protected to a standard consistent with this policy.
        </p>

        <h2 id="cookies" className={H2} style={{ color: "var(--text)" }}>
          Cookies and tracking
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We use cookies and similar technologies as described in our{" "}
          <Link prefetch={false} href="/cookies" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Cookie Policy
          </Link>
          . At present the Website uses only cookies and local storage that are strictly necessary to sign you in
          and remember your display preference; it does not run advertising or third-party analytics trackers. If
          that changes, consent will be requested first.
        </p>

        <h2 id="retention" className={H2} style={{ color: "var(--text)" }}>
          Retention
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We retain personal data only for as long as necessary for the purposes for which it was collected, or as
          required by law, after which it is erased or anonymised. Indicative periods:
        </p>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          {legal.retentionPeriods.map(([label, period]) => (
            <li key={label}>
              <strong style={{ color: "var(--text)" }}>{label}:</strong> {period}.
            </li>
          ))}
        </ul>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Operational records are otherwise retained for {legal.retention}. Full account deletion is currently
          handled manually by a chapter administrator and is audited. Audit history may retain a non-content
          record where the chapter is legally required to preserve an administrative trail.
        </p>

        <h2 id="security" className={H2} style={{ color: "var(--text)" }}>
          Security and breaches
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We implement reasonable security safeguards, including encryption in transit (HTTPS), hashed
          credentials, access controls scoped by session, chapter membership and role, and secure hosting. No
          method of transmission or storage is completely secure. In the event of a personal data breach
          affecting you, we will notify you and the relevant authority as required by Applicable Law. Suspected
          misuse can be reported to {contact} for administrative and audit review.
        </p>

        <h2 id="rights" className={H2} style={{ color: "var(--text)" }}>
          Your rights
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Subject to Applicable Law, you have the right to:
        </p>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>(a) access a summary of the personal data we process about you and the identities of those with whom we have shared it;</li>
          <li>(b) correction and completion of inaccurate or incomplete data;</li>
          <li>(c) erasure of personal data that is no longer necessary for the purpose it was collected;</li>
          <li>(d) withdraw consent at any time;</li>
          <li>(e) grievance redressal, by having a complaint about our handling of your data addressed by us;</li>
          <li>
            (f) nominate another individual to exercise your rights on your behalf in the event of your death or
            incapacity.
          </li>
        </ul>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          If you are in the European Economic Area or the United Kingdom, you also have the right to object to or
          restrict processing, to data portability, and to lodge a complaint with your local supervisory
          authority. To exercise any of these rights, write to {contact}. We may need to verify your identity and
          will respond within a reasonable time and in any event within the period required by law. If you are not
          satisfied with our response, you may complain to the Data Protection Board of India after first raising
          your grievance with us; we aim to resolve grievances within ninety (90) days.
        </p>

        <h2 id="children" className={H2} style={{ color: "var(--text)" }}>
          Children&rsquo;s data
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          The Website is not intended for children under 18 years of age. We do not knowingly process the personal
          data of a child without verifiable consent of a parent or lawful guardian. If you believe a child has
          provided us with personal data, please contact us and we will delete it promptly. We do not track or
          monitor the behaviour of children, or direct targeted advertising at them.
        </p>

        <h2 id="third-party-sites" className={H2} style={{ color: "var(--text)" }}>
          Third-party websites
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          The Website may link to third-party sites &mdash; for example GitHub repositories, developer profiles or
          embedded media &mdash; that are not governed by this policy. We are not responsible for their privacy
          practices and encourage you to read their policies.
        </p>

        <h2 id="changes" className={H2} style={{ color: "var(--text)" }}>
          Changes
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We may update this policy from time to time. Changes take effect when posted on this page with a revised
          effective date. Where changes are material, we take reasonable steps to notify you, and acceptance of the
          new version is recorded through the consent step the next time you sign in.
        </p>

        <h2 id="grievance" className={H2} style={{ color: "var(--text)" }}>
          Grievance officer and contact
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          For privacy questions, requests or complaints, contact:
        </p>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Grievance Officer / Data Protection Contact:</strong>{" "}
            {legal.grievanceOfficer || `the Grievance Officer, ${legal.operatorName}`}
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Designation:</strong> {legal.grievanceDesignation}
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Email:</strong>{" "}
            {grievanceEmail ? (
              <a href={`mailto:${grievanceEmail}`} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                {grievanceEmail}
              </a>
            ) : (
              <>
                through the{" "}
                <Link prefetch={false} href="/contact" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  contact page
                </Link>
              </>
            )}
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Address:</strong> {legal.grievanceAddress}
          </li>
        </ul>

        <p className="mt-10 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Related:{" "}
          <Link prefetch={false} href="/cookies" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Cookies
          </Link>{" "}
          ·{" "}
          <Link prefetch={false} href="/terms" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Terms
          </Link>{" "}
          ·{" "}
          <Link prefetch={false} href="/disclaimer" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Disclaimer
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
