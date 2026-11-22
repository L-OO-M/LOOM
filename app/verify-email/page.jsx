import Link from "next/link";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { PageHero } from "@/components/landing/PageHero";

export const metadata = {
  title: "Confirm your email",
  description: "Confirm the email address on your LOOM account.",
  robots: { index: false, follow: false },
};

// `pending` is the state the middleware sends an unverified email/password
// identity to. The others are the outcomes of clicking the link itself.
const STATES = {
  pending: {
    title: "Confirm your email to continue",
    body: "We emailed you a confirmation link when you signed up. Open it, then sign in again.",
  },
  verified: {
    title: "Email confirmed.",
    body: "Your address is now verified on this account. Sign in again to pick up where you left off.",
  },
  expired: {
    title: "That link has expired.",
    body: "Confirmation links last 24 hours. Ask a chapter admin to send a new one, then sign in.",
  },
  invalid: {
    title: "That link didn’t work.",
    body: "It may have been used already, or it may belong to a different account. Ask a chapter admin to send a new link, then sign in.",
  },
  error: {
    title: "We couldn’t confirm that link.",
    body: "Something went wrong on our side. Try again in a moment, or ask a chapter admin to send a new link.",
  },
};

// Every state used to point at "Settings" for a resend. That control was
// retired when Auth0 took over verification (the route answers 410 Gone), so
// the page was promising a button that no longer exists.
const HELP = {
  pending: [
    "The link works once and expires in 24 hours.",
    "Nothing in your inbox? Check the spam folder first.",
    "Already clicked it? Sign out below, then sign in again — the session you are holding was issued before you confirmed.",
    "Still nothing? Ask a chapter admin to resend the confirmation email for your account."
  ],
  verified: [
    "Signing in again is enough — there is nothing else to do.",
    "Email and password, Google and GitHub all land in the same LOOM profile."
  ],
  expired: [
    "Confirmation links last 24 hours.",
    "Ask a chapter admin to resend it, then sign in."
  ],
  invalid: [
    "A link only works once, and only for the account it was sent to.",
    "Ask a chapter admin to send a new one if you need it."
  ],
  error: [
    "Try the link again in a moment.",
    "If it keeps failing, ask a chapter admin to resend the confirmation email."
  ]
};

export default async function VerifyEmailPage({ searchParams }) {
  const sp = await searchParams;
  const status = typeof sp?.status === "string" ? sp.status : "";
  const state = STATES[status] || null;
  const help = HELP[status] || HELP.pending;
  const confirmed = status === "verified";

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <div className="pt-16">
        <PageHero
          kicker="Account"
          title={state?.title || "Confirm your email"}
          lede={
            state?.body ||
            "Email and password sign-ups confirm their address before LOOM opens. Google and GitHub arrive already confirmed by the provider."
          }
        />
      </div>
      <section className="mx-auto max-w-2xl px-5 py-12 sm:px-6">
        <div className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <ul className="space-y-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            {help.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {/* The session cookie still carries the claims from before the address
              was confirmed, so a plain "sign in" link would bounce straight back
              here. Clearing the session is what makes the next sign-in read the
              fresh, verified token. */}
          <div className="mt-5 flex flex-wrap gap-3">
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn-ink !py-2 text-sm">
                {confirmed ? "Sign in again" : "Sign out and sign in again"}
              </button>
            </form>
            <Link href="/" prefetch={false} className="btn-ghost !py-2 text-sm">
              Back to home
            </Link>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
