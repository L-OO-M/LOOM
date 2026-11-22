"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authCallbackMessage, safeRedirectPath } from "@/lib/auth";
import { GITHUB_SIGNIN_ENABLED } from "@/lib/auth-providers";
import { AuthShell } from "@/app/(auth)/_components/AuthShell";
import AuthHandoffNote from "@/app/(auth)/_components/AuthHandoffNote";

// Auth0 owns the front door, but "one Auth0 button" is not a sign-in page.
// This page offers the real paths a member expects:
//
//   1. Email/username + password -> Auth0's database connection form.
//   2. GitHub       -> Auth0's GitHub social connection, straight to GitHub.
//                     Currently hidden behind GITHUB_SIGNIN_ENABLED while the
//                     connection is sorted out; see docs/31-known-issues.md.
//                     The href and the Auth0 connection are unchanged.
//
// Both go through /auth/login, which the SDK turns into an /authorize request.
// Credentials are entered on Auth0's page, never on this origin: that keeps
// Auth0's bot/brute-force protection, its password policy, and our own app free
// of password handling. There is no Supabase credential path any more.
//
// The password path is listed FIRST and sends `screen_hint=login`. Without it
// Auth0's Universal Login can open on the "Create account" tab, so a member who
// had just set a password in onboarding typed it into a signup form and was told
// the account already existed. Sign-in and sign-up are different intents; each
// gets its own button and its own hint.
//
// `returnTo` carries a sanitized destination, so signing in deep-links to the
// page that sent the user here instead of dumping them on the default home.
// The SDK validates returnTo again on its side (toSafeRedirect), so this is
// defence in depth.
//
// With no explicit destination the default is /auth/continue, NOT the site root.
// The SDK's own default is the root, which is the public marketing page -- a
// member who had just signed in landed there and it reads as "login did not
// work". /auth/continue resolves the role and sends them to the right workspace.
function AuthOptions() {
  const params = useSearchParams();
  const redirect = safeRedirectPath(params.get("redirect"));
  const target = redirect || "/auth/continue";
  const returnTo = `returnTo=${encodeURIComponent(target)}`;
  // The callback redirects here with a code, never the provider's raw wording.
  const callbackError = authCallbackMessage(params.get("error"));

  return (
    <>
      {callbackError && (
        <p
          role="alert"
          className="mb-3 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--wash)" }}
        >
          {callbackError}
        </p>
      )}
      <a
        href={`/auth/login?screen_hint=login&${returnTo}`}
        className="btn-ink w-full justify-center"
      >
        Continue with email &amp; password
      </a>
      {GITHUB_SIGNIN_ENABLED && (
        <a
          href={`/auth/login?connection=github&${returnTo}`}
          className="btn-ghost w-full justify-center"
        >
          Continue with GitHub
        </a>
      )}
      {GITHUB_SIGNIN_ENABLED && !callbackError && (
        <p className="text-center text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          GitHub not opening? Use your email and password — both sign in to the same account.
        </p>
      )}
    </>
  );
}

const fallbackLinks = (
  <>
    <a href="/auth/login?screen_hint=login&returnTo=%2Fauth%2Fcontinue" className="btn-ink w-full justify-center">
      Continue with email &amp; password
    </a>
    {GITHUB_SIGNIN_ENABLED && (
      <a href="/auth/login?connection=github&returnTo=%2Fauth%2Fcontinue" className="btn-ghost w-full justify-center">
        Continue with GitHub
      </a>
    )}
  </>
);

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--text)" }}>
        Sign in
      </h1>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        {GITHUB_SIGNIN_ENABLED
          ? "Use the email and password you set up, or the provider you signed up with."
          : "Use the email and password you set up."}
      </p>

      <div className="mt-6 space-y-3">
        <Suspense fallback={<div className="space-y-3">{fallbackLinks}</div>}>
          <AuthOptions />
        </Suspense>
        <AuthHandoffNote className="text-center" />
      </div>

      <p className="mt-7 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        New here?{" "}
        <Link
          prefetch={false}
          href="/register"
          className="font-semibold hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
