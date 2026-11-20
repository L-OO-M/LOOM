"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authCallbackMessage, safeRedirectPath } from "@/lib/auth";
import { AuthShell } from "@/app/(auth)/_components/AuthShell";
import AuthHandoffNote from "@/app/(auth)/_components/AuthHandoffNote";

// Auth0 owns the front door. There is no email/password form here any more:
// Supabase sign-in has been retired, so this page shows one action and nothing
// that implies a second way in.
//
// `returnTo` carries a sanitized destination, so an Auth0 login deep-links to
// the page that sent the user here instead of dumping them on the default home.
// The SDK validates returnTo again on its side (toSafeRedirect), so this is
// defence in depth.
//
// With no explicit destination the default is /auth/continue, NOT the site root.
// The SDK's own default is the root, which is the public marketing page -- a
// member who had just signed in landed there and it reads as "login did not
// work". /auth/continue resolves the role and sends them to the right workspace.
function Auth0Cta() {
  const params = useSearchParams();
  const redirect = safeRedirectPath(params.get("redirect"));
  const target = redirect || "/auth/continue";
  const href = `/auth/login?returnTo=${encodeURIComponent(target)}`;
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
      <a href={href} className="btn-ink w-full justify-center">Continue with Auth0</a>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--text)" }}>
        Sign in
      </h1>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        One login for members, leads and admins.
      </p>

      <div className="mt-6 space-y-3">
        <Suspense fallback={<a href="/auth/login?returnTo=%2Fauth%2Fcontinue" className="btn-ink w-full justify-center">Continue with Auth0</a>}>
          <Auth0Cta />
        </Suspense>
        <AuthHandoffNote className="text-center" />
      </div>

      <p className="mt-7 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        New here?{" "}
        <Link
          prefetch={false}
          href="/auth/login?screen_hint=signup&returnTo=%2Fauth%2Fcontinue"
          className="font-semibold hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Create an account
        </Link>
      </p>

      <div className="mt-8 border-t pt-5" style={{ borderColor: "var(--line)" }}>
        <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          Setting up a new chapter? Sign in, then claim the first admin at{" "}
          <Link prefetch={false} href="/setup" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            /setup
          </Link>
          . It only works once.
        </p>
      </div>
    </AuthShell>
  );
}
