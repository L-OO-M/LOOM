"use client";

import Link from "next/link";
import { AuthShell } from "@/app/(auth)/_components/AuthShell";
import AuthHandoffNote from "@/app/(auth)/_components/AuthHandoffNote";

// Account creation is Auth0's job now.
//
// This route used to host the Supabase signup form (email, password, roll
// number, branch, year, domains, consent). All of that moved: Auth0 owns the
// credential, and the profile fields are collected in onboarding after the
// first sign-in, where they can be validated against the chapter that actually
// owns the account.
//
// The page stays because /register is linked from the marketing site and old
// emails, and a 404 there looks like the product is broken.
export default function RegisterPage() {
  return (
    <AuthShell>
      <p className="kicker">Join the chapter</p>
      <h1 className="font-display mt-3 text-3xl font-medium tracking-tight" style={{ color: "var(--text)" }}>
        Create account
      </h1>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        Create your account once, then link GitHub or another provider from the same identity.
      </p>
      <a
        href="/auth/login?screen_hint=signup&returnTo=%2Fauth%2Fcontinue"
        className="btn-ink mt-6 w-full justify-center"
      >
        Continue with Auth0
      </a>
      <AuthHandoffNote className="mt-3" />
      <p className="mt-5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
        By continuing you agree to LOOM&apos;s{" "}
        <Link prefetch={false} href="/terms" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Terms
        </Link>{" "}
        and acknowledge the{" "}
        <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Privacy notice
        </Link>{" "}
        and{" "}
        <Link prefetch={false} href="/cookies" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Cookie notice
        </Link>
        .
      </p>
      <p className="mt-7 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Already registered?{" "}
        <Link prefetch={false} href="/login" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
