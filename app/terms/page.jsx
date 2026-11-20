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
    "The agreement for using LOOM: eligibility, accounts, acceptable use, member content and code, moderation, fees, liability, dispute resolution, and the Grievance Officer.",
  ...canonicalFor("/terms"),
  openGraph: {
    title: "Terms | LOOM",
    description:
      "Eligibility, accounts, acceptable use, member content, moderation, liability, and dispute resolution."
  }
};

const SECTIONS = [
  { id: "agreement", title: "Agreement" },
  { id: "definitions", title: "Definitions" },
  { id: "eligibility-and-accounts", title: "Eligibility and accounts" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "intellectual-property", title: "Intellectual property" },
  { id: "member-content", title: "Member content and code" },
  { id: "fees-and-payments", title: "Fees and payments" },
  { id: "third-party-services", title: "Third-party links and services" },
  { id: "warranties", title: "Disclaimer of warranties" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnification" },
  { id: "termination", title: "Suspension and termination" },
  { id: "privacy", title: "Privacy and data protection" },
  { id: "changes", title: "Changes to these terms" },
  { id: "force-majeure", title: "Force majeure" },
  { id: "general", title: "General provisions" },
  { id: "governing-law", title: "Governing law and disputes" },
  { id: "grievance", title: "Grievance officer and contact" }
];

const H2 = "font-display mt-10 text-2xl font-medium sm:text-3xl";
const P = "mt-3 text-sm leading-7";
const UL = "mt-3 list-disc space-y-2 pl-5 text-sm leading-7";

export default function TermsPage() {
  const legal = legalConfig();
  const contact = legal.contactEmail
    ? `${legal.contactName} (${legal.contactEmail})`
    : `${legal.contactName} through the contact page`;
  const grievanceEmail = legal.grievanceEmail || legal.contactEmail;

  return (
    <PublicInformationPage
      kicker="Terms"
      title="Terms and conditions."
      lede="The agreement between you and the operator of this LOOM deployment: eligibility, accounts, acceptable conduct, member content and code, moderation, liability, and disputes."
      published={legal.published}
      sections={SECTIONS}
    >
      <JsonLd
        data={webPageSchema({
          name: "Terms and conditions",
          path: "/terms",
          description:
            "Eligibility, accounts, acceptable use, member content, moderation, liability, and dispute resolution."
        })}
      />

      <section className="information-article" aria-label="Terms and conditions">
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Read these Terms before using the Website. They are accompanied by the{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy Policy
          </Link>
          ,{" "}
          <Link prefetch={false} href="/cookies" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Cookie Policy
          </Link>{" "}
          and{" "}
          <Link prefetch={false} href="/disclaimer" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Disclaimer
          </Link>
          , which form part of this agreement.
        </p>

        <h2 id="agreement" className={H2} style={{ color: "var(--text)" }}>
          Agreement
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          These Terms and Conditions (the &ldquo;Terms&rdquo;) form a legally binding agreement between you
          (&ldquo;you&rdquo; or the &ldquo;User&rdquo;) and {legal.operatorName}, {legal.operatorAddress}
          {legal.registrationNumber ? `, registration ${legal.registrationNumber}` : ""} (&ldquo;we&rdquo;,
          &ldquo;us&rdquo; or &ldquo;our&rdquo;). We operate {legal.website} and any related pages, features,
          content and services (together, the &ldquo;Website&rdquo;).
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          By accessing, browsing, registering on or otherwise using the Website, you confirm that you have read,
          understood and agree to be bound by these Terms, together with the Privacy Policy, Cookie Policy and
          Disclaimer, which are incorporated into these Terms by reference. If you do not agree, you must not
          access or use the Website.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          These Terms constitute an electronic record under the Information Technology Act, 2000 and the rules
          made under it. They do not require any physical or digital signature.
        </p>

        <h2 id="definitions" className={H2} style={{ color: "var(--text)" }}>
          Definitions
        </h2>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Content</strong> means all text, graphics, images, logos,
            audio, video, software, data and other material made available on or through the Website.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>User Content</strong> means any content, comment, file or
            other material that you submit, upload or post on or through the Website.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Services</strong> means the features, products and services
            we offer through the Website &mdash; a community platform where developers create profiles, follow
            roadmaps, practise problems, post and discuss code and projects, and interact with other members.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Applicable Law</strong> means all laws, rules and
            regulations in force in India from time to time, and any other law that applies to your use of the
            Website.
          </li>
        </ul>

        <h2 id="eligibility-and-accounts" className={H2} style={{ color: "var(--text)" }}>
          Eligibility and accounts
        </h2>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            You must be at least 18 years old and capable of entering into a legally binding contract under
            Applicable Law. If you are under 18, you may use the Website only under the supervision and with the
            consent of a parent or legal guardian, who accepts these Terms on your behalf.
          </li>
          <li>
            Accounts are intended for members of a participating college chapter. Members must provide accurate,
            current and complete identity and chapter information, and keep it up to date.
          </li>
          <li>
            Roles and permissions are granted by chapter administrators and leads through audited workflows. They
            are never self-selected, and no member can edit their own role.
          </li>
          <li>
            You are responsible for keeping your login credentials confidential and for all activity that takes
            place under your account. Sign out of shared devices.
          </li>
          <li>
            Notify {contact} immediately of any unauthorised use or security breach.
          </li>
          <li>
            We may refuse registration, or suspend or delete an account, at our reasonable discretion, including
            where we believe information provided is false or these Terms have been breached.
          </li>
        </ul>

        <h2 id="acceptable-use" className={H2} style={{ color: "var(--text)" }}>
          Acceptable use
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable licence to
          access and use the Website for your personal and lawful purposes. You agree not to:
        </p>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>(a) use the Website in violation of any Applicable Law or the rights of any third party;</li>
          <li>
            (b) attempt to gain unauthorised access to the Website, our servers, or any account, system or
            network connected to it &mdash; including bypassing authentication, authorisation, chapter isolation,
            rate limits, audit logging or moderation controls;
          </li>
          <li>(c) transmit any virus, malware or other harmful or disruptive code;</li>
          <li>
            (d) copy, scrape, harvest, mirror or republish the Website or its Content in bulk, by automated or
            manual means, without our prior written consent;
          </li>
          <li>(e) reverse engineer, decompile or attempt to extract the source code of any part of the Website;</li>
          <li>(f) impersonate any person or misrepresent your affiliation with any person or entity;</li>
          <li>
            (g) post or transmit any content that is unlawful, defamatory, obscene, harassing or discriminatory,
            or that infringes any intellectual property or privacy right &mdash; including false proof,
            misattributed work, manipulated activity, credential forgery or misleading endorsements;
          </li>
          <li>(h) interfere with or disrupt the operation of the Website or the experience of other users.</li>
        </ul>

        <h2 id="intellectual-property" className={H2} style={{ color: "var(--text)" }}>
          Intellectual property
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          The Website and all Content, including the name &ldquo;LOOM&rdquo;, logos, designs, text, graphics,
          software and the selection and arrangement of them, are owned by or licensed to us and are protected
          by copyright, trademark and other intellectual property laws of India and other countries. Except as
          expressly permitted by these Terms, no part of the Website or its Content may be copied, reproduced,
          modified, distributed, transmitted, displayed, sold, licensed or otherwise exploited without our prior
          written permission. All rights not expressly granted are reserved.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Member-submitted work is treated separately in the next section. Public verification of a badge,
          certificate or linked account establishes only that a record exists and has the displayed status; it
          does not independently guarantee employment readiness, academic credit or third-party acceptance.
        </p>

        <h2 id="member-content" className={H2} style={{ color: "var(--text)" }}>
          Member content and code
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          You retain ownership of the User Content you submit. By submitting User Content, you grant us a
          worldwide, non-exclusive, royalty-free, sub-licensable licence to host, store, reproduce, adapt,
          display and distribute it in connection with operating, providing and promoting the Website. You
          represent and warrant that you own or have the necessary rights to submit it, and that it does not
          violate these Terms, Applicable Law or the rights of any third party.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>Code and software.</strong> If you post source code,
          snippets, projects or other software (&ldquo;Code&rdquo;), you remain its owner and are solely
          responsible for the licence under which you share it. If you post Code owned by someone else, you must
          have the right to do so and must comply with its licence terms, including attribution requirements.
          Open-source Code is licensed to other members only on the licence terms you state; absent a stated
          licence, you grant other members a non-exclusive licence to view, run and discuss it for learning and
          non-commercial purposes within the Website.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>What you must not post.</strong> You must not post: (a)
          passwords, API keys, tokens, private keys or other credentials, whether yours or anyone else&rsquo;s;
          (b) confidential or proprietary code belonging to your employer, client or any third party without
          authorisation; (c) malware, ransomware, spyware or code designed to damage, disable or gain
          unauthorised access to any system; (d) exploits, proofs of concept or vulnerability details intended
          to be used against systems you do not own or have permission to test; or (e) personal data of other
          individuals without their consent. Responsible, good-faith security discussion that does not enable
          unlawful access is permitted.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>Moderation and removal.</strong> We may, but are not obliged
          to, review, restrict or remove User Content and suspend accounts that violate these Terms, the
          community guidelines or Applicable Law. In line with the Information Technology (Intermediary
          Guidelines and Digital Media Ethics Code) Rules, 2021, we will not host, display or transmit content
          that is prohibited under Applicable Law, and we will act on lawful takedown orders and valid
          complaints. Moderation flags are community signals; chapter administrators make the final decision,
          with an administrative audit trail where applicable.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>Reporting infringing or unlawful content.</strong> Write to
          the Grievance Officer named in clause 18 with your contact details, the exact link to the content, the
          right you claim has been infringed, and a statement that your complaint is made in good faith. We may
          remove content while we investigate and may terminate the accounts of users who repeatedly infringe
          the rights of others.
        </p>

        <h2 id="fees-and-payments" className={H2} style={{ color: "var(--text)" }}>
          Fees and payments
        </h2>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            Certain Services may be offered for a fee. Prices, applicable taxes and payment terms are displayed
            before you complete a purchase. Unless otherwise indicated, fees are stated in {legal.currency}.
          </li>
          <li>
            Payments are processed by third-party payment providers. We do not store your complete card or
            banking details.
          </li>
          <li>
            Cancellations and refunds are handled by the chapter through the{" "}
            <Link prefetch={false} href={legal.refundPath} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              contact page
            </Link>
            . Where a specific refund policy applies to an event or service, it is shown before purchase.
          </li>
        </ul>

        <h2 id="third-party-services" className={H2} style={{ color: "var(--text)" }}>
          Third-party links and services
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          The Website may contain links to, or integrations with, third-party websites and services &mdash; for
          example GitHub, linked developer profiles, or media hosted elsewhere. These are provided for
          convenience only. We do not control, endorse or accept responsibility for their content, availability,
          terms or privacy practices, and your use of them is at your own risk.
        </p>

        <h2 id="warranties" className={H2} style={{ color: "var(--text)" }}>
          Disclaimer of warranties
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          THE WEBSITE AND ALL CONTENT AND SERVICES ARE PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE&rdquo; BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED
          WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY AND NON-INFRINGEMENT. We do
          not warrant that the Website will be uninterrupted, timely, secure or error-free, or that any defects
          will be corrected.
        </p>

        <h2 id="liability" className={H2} style={{ color: "var(--text)" }}>
          Limitation of liability
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, WE AND OUR DIRECTORS, PARTNERS, EMPLOYEES AND
          AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE
          DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR
          USE OF, OR INABILITY TO USE, THE WEBSITE.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Our total aggregate liability to you for any claim arising out of or relating to these Terms or the
          Website shall not exceed {legal.liabilityCap}. Nothing in these Terms excludes or limits any liability
          that cannot be excluded or limited under Applicable Law. Member-submitted work, external links and
          third-party services remain the responsibility of the member or provider that supplied them.
        </p>

        <h2 id="indemnity" className={H2} style={{ color: "var(--text)" }}>
          Indemnification
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          You agree to indemnify, defend and hold harmless us and our directors, partners, employees and
          affiliates from and against any claims, liabilities, damages, losses and expenses (including
          reasonable legal fees) arising out of or in connection with your breach of these Terms, your User
          Content, or your violation of any Applicable Law or third-party right.
        </p>

        <h2 id="termination" className={H2} style={{ color: "var(--text)" }}>
          Suspension and termination
        </h2>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            We may suspend or terminate your access at any time, with or without notice, if we reasonably believe
            you have breached these Terms or Applicable Law.
          </li>
          <li>
            You may stop using the Website at any time. If you have an account, you may request its deletion
            through {contact}. Deletion is completed by a chapter administrator and is audited.
          </li>
          <li>
            The intellectual property, member content, warranty, liability, indemnity and dispute-resolution
            clauses, and any other provision intended by its nature to survive, continue to apply after
            termination.
          </li>
        </ul>

        <h2 id="privacy" className={H2} style={{ color: "var(--text)" }}>
          Privacy and data protection
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Your use of the Website is also governed by our{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy Policy
          </Link>
          , which explains how we collect, use and protect your personal data, and by our{" "}
          <Link prefetch={false} href="/cookies" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Cookie Policy
          </Link>
          . Where we need your consent to process personal data, we request it separately and in clear terms.
          Acceptance of these Terms alone does not constitute that consent, and you may withdraw it at any time
          as described in the Privacy Policy.
        </p>

        <h2 id="changes" className={H2} style={{ color: "var(--text)" }}>
          Changes to these terms
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We may modify, suspend or discontinue any part of the Website at any time. We may revise these Terms
          from time to time. The revised Terms take effect when posted on this page with an updated effective
          date. Where a revision is material, acceptance of the new version is recorded through the
          consent step the next time you sign in; continued use after that date constitutes acceptance.
        </p>

        <h2 id="force-majeure" className={H2} style={{ color: "var(--text)" }}>
          Force majeure
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We shall not be liable for any failure or delay in performing our obligations where caused by events
          beyond our reasonable control, including natural disasters, epidemics, war, riots, government action,
          internet or power failures, or failures of third-party service providers.
        </p>

        <h2 id="general" className={H2} style={{ color: "var(--text)" }}>
          General provisions
        </h2>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Entire agreement.</strong> These Terms, together with the
            policies referred to in them, constitute the entire agreement between you and us regarding the
            Website and supersede any prior understandings.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Severability.</strong> If any provision is held invalid or
            unenforceable, the remaining provisions continue in full force and effect.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>No waiver.</strong> Our failure to enforce any right or
            provision is not a waiver of that right or provision.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Assignment.</strong> You may not assign or transfer your
            rights without our written consent. We may assign our rights and obligations to a successor to our
            business.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Notices.</strong> We may give you notice by posting on the
            Website or by email to the address you have provided. You may contact us at the address in the
            Grievance Officer section.
          </li>
        </ul>

        <h2 id="governing-law" className={H2} style={{ color: "var(--text)" }}>
          Governing law and dispute resolution
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          These Terms are governed by and construed in accordance with {legal.governingLaw}, without regard to
          conflict-of-law principles. In the event of any dispute, the parties shall first attempt to resolve it
          amicably by written notice and good-faith discussions for thirty (30) days.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          If the dispute is not resolved within that period, it shall be referred to and finally resolved by
          arbitration under the Arbitration and Conciliation Act, 1996, as amended (the &ldquo;Arbitration
          Act&rdquo;), including any dispute about the existence, validity, interpretation, performance, breach
          or termination of these Terms.
        </p>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Seat and language.</strong> The seat and venue of
            arbitration is {legal.arbitrationSeat}. The language is English.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Tribunal.</strong> The tribunal consists of a sole
            arbitrator, appointed by mutual written agreement within thirty (30) days of a written notice of
            arbitration. Failing agreement, the arbitrator is appointed in accordance with the Arbitration Act
            through {legal.arbitrationInstitution}. The arbitrator must be independent and impartial and must
            make the disclosures required under Section 12 of the Arbitration Act.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Procedure and award.</strong> The arbitrator determines
            the procedure, which may be conducted wholly or partly by documents and by electronic means. A
            reasoned award is given within eight (8) months of entering upon the reference unless extended under
            the Arbitration Act. The award is final and binding and may be enforced by any court of competent
            jurisdiction.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Costs.</strong> Each party bears its own legal costs. The
            arbitrator&rsquo;s fees and expenses are shared equally unless the award directs otherwise.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Individual claims.</strong> To the fullest extent permitted
            by Applicable Law, arbitration is conducted on an individual basis only. Claims of different users
            are not joined, consolidated or brought as a class or representative action.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Confidentiality.</strong> The parties keep the existence,
            content and outcome of the arbitration confidential, except as required by law, to enforce or
            challenge an award, or to obtain legal or professional advice.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Interim relief.</strong> Nothing in this clause prevents
            either party from seeking urgent interim or protective relief from a competent court. For that
            purpose and for enforcement of any award, the courts at {legal.jurisdiction} have exclusive
            jurisdiction.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Consumer rights.</strong> Nothing in this clause limits any
            right you may have under the Consumer Protection Act, 2019 or any other law that cannot be excluded
            by agreement. This clause survives termination.
          </li>
        </ul>

        <h2 id="grievance" className={H2} style={{ color: "var(--text)" }}>
          Grievance officer and contact
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          For any question, complaint or concern regarding these Terms or the Website, contact the Grievance
          Officer:
        </p>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Grievance Officer:</strong>{" "}
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
          <li>
            <strong style={{ color: "var(--text)" }}>Response time:</strong> complaints are acknowledged within{" "}
            {legal.acknowledgementHours} hours and resolved within {legal.resolutionDays} days of receipt, or
            within such other period as Applicable Law requires.
          </li>
        </ul>

        <p className="mt-10 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          Related:{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy
          </Link>{" "}
          ·{" "}
          <Link prefetch={false} href="/cookies" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Cookies
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
