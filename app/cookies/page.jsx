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
  title: "Cookies",
  description:
    "The cookies and local storage LOOM actually uses: the session cookie that signs you in, your theme preference, and why there are no advertising or analytics trackers.",
  ...canonicalFor("/cookies"),
  openGraph: {
    title: "Cookies | LOOM",
    description:
      "The cookies and local storage LOOM uses, and the trackers it does not use."
  }
};

const SECTIONS = [
  { id: "what-are-cookies", title: "What cookies are" },
  { id: "cookies-we-use", title: "Cookies we use" },
  { id: "what-we-do-not-use", title: "What we do not use" },
  { id: "local-storage", title: "Preferences and local storage" },
  { id: "third-party", title: "Third-party content" },
  { id: "choices", title: "Your choices" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" }
];

const H2 = "font-display mt-10 text-2xl font-medium sm:text-3xl";
const P = "mt-3 text-sm leading-7";
const UL = "mt-3 list-disc space-y-2 pl-5 text-sm leading-7";

export default function CookiesPage() {
  const legal = legalConfig();
  const contact = legal.contactEmail
    ? `${legal.contactName} (${legal.contactEmail})`
    : `${legal.contactName} through the contact page`;

  return (
    <PublicInformationPage
      kicker="Cookies"
      title="Cookie policy."
      lede="The cookies and local storage this deployment actually uses, and the advertising and analytics trackers it does not."
      published={legal.published}
      sections={SECTIONS}
    >
      <JsonLd
        data={webPageSchema({
          name: "Cookie policy",
          path: "/cookies",
          description:
            "The cookies and local storage LOOM uses, and the trackers it does not use."
        })}
      />

      <section className="information-article" aria-label="Cookie policy">
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          This policy explains how {legal.operatorName} uses cookies and similar technologies on{" "}
          {legal.website}. It should be read together with our{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy Policy
          </Link>
          .
        </p>

        <h2 id="what-are-cookies" className={H2} style={{ color: "var(--text)" }}>
          What cookies are
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Cookies are small text files placed on your device when you visit a website. They allow a site to
          function, remember your preferences, and provide information to the site owner. Similar technologies
          include pixels, local storage and tags, and are referred to in this policy as &ldquo;cookies&rdquo;.
        </p>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Cookies may be <em>session</em> cookies, which expire when you close your browser, or <em>persistent</em>{" "}
          cookies, which remain until they expire or you delete them. They may be <em>first-party</em> (set by us)
          or <em>third-party</em> (set by another provider).
        </p>

        <h2 id="cookies-we-use" className={H2} style={{ color: "var(--text)" }}>
          Cookies we use
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          This deployment uses only <strong style={{ color: "var(--text)" }}>strictly necessary</strong> cookies.
          They are required to sign you in and keep your session secure; the Website cannot work without them, so
          they are placed without a consent prompt.
        </p>
        <ul className={UL} style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>Session cookie</strong> &mdash; set by our authentication
            provider. With Supabase Auth it is named with the <code>sb-</code> prefix (for example{" "}
            <code>sb-&lt;project&gt;-auth-token</code>); where Auth0 is configured it is the{" "}
            <code>appSession</code> cookie. It holds your encrypted or signed session so the server can identify
            you on each request, and it expires when the session ends or after the configured lifetime.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Short-lived flow cookies</strong> &mdash; for example the
            PKCE verifier and single-use state value used while you link a GitHub account. These exist for a few
            minutes, are <code>HttpOnly</code>, and are deleted when the flow completes or fails.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>Security cookies</strong> &mdash; where enabled by the hosting
            or database provider, these support rate limiting, bot mitigation and load balancing. They carry no
            profile data.
          </li>
        </ul>

        <h2 id="what-we-do-not-use" className={H2} style={{ color: "var(--text)" }}>
          What we do not use
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          This deployment does not set advertising, marketing, cross-site tracking or third-party analytics
          cookies. There is no Google Analytics, Meta Pixel, ad-network tag or session-replay script on the
          Website. Because no non-essential cookie is placed, there is no cookie banner to dismiss; if a future
          release adds analytics or marketing cookies, we will ask for consent first and update this page.
        </p>

        <h2 id="local-storage" className={H2} style={{ color: "var(--text)" }}>
          Preferences and local storage
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Your display choices are stored in your browser&rsquo;s local storage rather than in a cookie. Two keys
          are used: <code>loom-theme</code> (dark or light) and <code>loom-palette</code> (the accent palette).
          They contain no personal data, are never sent to other sites, and can be cleared through your browser
          settings. They are treated as a preference, not as tracking.
        </p>

        <h2 id="third-party" className={H2} style={{ color: "var(--text)" }}>
          Third-party content
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          The Website does not embed third-party players or widgets that set cookies when a page loads. Links to
          GitHub, YouTube, documentation and developer profiles are ordinary links: those sites apply their own
          cookies and policies once you open them, and we do not control them. If a future release embeds a
          third-party player, this page will be updated first; any YouTube embed would use the privacy-enhanced{" "}
          <code>youtube-nocookie.com</code> domain.
        </p>

        <h2 id="choices" className={H2} style={{ color: "var(--text)" }}>
          Your choices
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          You can block or delete cookies through your browser settings. Blocking the session cookie signs you out
          and prevents sign-in, so the authenticated areas will not work. For instructions, see the help pages of
          your browser. If you have a question about a specific cookie, write to {contact}.
        </p>

        <h2 id="changes" className={H2} style={{ color: "var(--text)" }}>
          Changes
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          We may update this policy from time to time. The revised version is posted on this page with an updated
          effective date.
        </p>

        <h2 id="contact" className={H2} style={{ color: "var(--text)" }}>
          Contact
        </h2>
        <p className={P} style={{ color: "var(--text-muted)" }}>
          Questions about our use of cookies may be sent to {contact}.
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
