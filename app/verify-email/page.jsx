import Link from "next/link";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { PageHero } from "@/components/landing/PageHero";

export const metadata = {
  title: "Confirm your email",
  description: "Confirm the email address on your L.O.O.M. account.",
  robots: { index: false, follow: false },
};

const STATES = {
  verified: {
    title: "Email confirmed.",
    body: "Your address is now marked as verified on this account. You can close this tab and return to LOOM.",
  },
  expired: {
    title: "That link has expired.",
    body: "Verification links last 24 hours. Sign in and request a new one from Settings.",
  },
  invalid: {
    title: "That link didn’t work.",
    body: "It may have been used already, or it may belong to a different account. Sign in and request a new link from Settings.",
  },
  error: {
    title: "We couldn’t confirm that link.",
    body: "Something went wrong on our side. Try again in a moment, or request a new link from Settings.",
  },
};

export default async function VerifyEmailPage({ searchParams }) {
  const sp = await searchParams;
  const status = typeof sp?.status === "string" ? sp.status : "";
  const state = STATES[status] || null;

  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <div className="pt-16">
        <PageHero
          kicker="Account"
          title={state?.title || "Confirm your email"}
          lede={
            state?.body ||
            "Verification is optional. It marks the address on your account as confirmed — it does not unlock features, and you can keep using LOOM without it."
          }
        />
      </div>
      <section className="mx-auto max-w-2xl px-5 py-12 sm:px-6">
        <div className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            L.O.O.M. does not collect college email addresses as a gate. Many colleges never
            issue one, and a chapter is a community, not a domain. If you want the address on
            your account marked as confirmed, sign in and send yourself a link from Settings.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/student/settings" prefetch={false} className="btn-ink !py-2 text-sm">
              Open settings
            </Link>
            <Link href="/login" prefetch={false} className="btn-ghost !py-2 text-sm">
              Sign in
            </Link>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
