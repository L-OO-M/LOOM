"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { authCallbackMessage, homeForRole, safeRedirectPath } from "@/lib/auth";
import { AuthField, AuthShell, authInputClass } from "@/app/(auth)/_components/AuthShell";
import GitHubSignInButton from "@/app/(auth)/_components/GitHubSignInButton";

// Auth0 owns the front door. `returnTo` carries the same sanitized destination
// the email form honours, so an Auth0 login deep-links to the page that sent the
// user here instead of dumping them on the default home. The SDK validates
// returnTo again on its side (toSafeRedirect), so this is defence in depth.
function Auth0Cta() {
  const redirect = safeRedirectPath(useSearchParams().get("redirect"));
  const href = redirect ? `/auth/login?returnTo=${encodeURIComponent(redirect)}` : "/auth/login";
  return <a href={href} className="btn-ink w-full justify-center">Continue with Auth0</a>;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `?redirect=` is attacker-controlled. It must be sanitised before it is ever
  // handed to router.push, or `/login?redirect=https://evil.example` turns this
  // page into an open redirect for freshly authenticated users.
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  // The callback redirects here with a code, never the provider's raw wording.
  const callbackError = authCallbackMessage(searchParams.get("error"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Explicit bounce targets are honored (layouts enforce access); otherwise
    // each level lands where it works: leads in /lead, admins in /admin. A
    // student who has not finished onboarding is sent straight there rather than
    // to a home page whose layout would only bounce them a hop later.
    if (redirect) {
      router.push(redirect);
    } else {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        const profile = data?.data?.profile;
        const dest =
          profile && profile.role === "student" && !profile.onboarding_completed
            ? "/student/onboarding"
            : homeForRole(profile?.role);
        router.push(dest);
      } catch {
        router.push("/student");
      }
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-4">
      {callbackError && (
        <p role="alert" className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--wash)" }}>
          {callbackError}
        </p>
      )}

      <AuthField id="email" label="Email">
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={authInputClass}
          style={{ borderColor: "var(--line)", color: "var(--text)" }}
          placeholder="student@college.edu"
          aria-describedby={error ? "login-err" : undefined}
        />
      </AuthField>

      <AuthField id="password" label="Password">
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={authInputClass}
          style={{ borderColor: "var(--line)", color: "var(--text)" }}
        />
      </AuthField>

      {error && (
        <p id="login-err" role="alert" className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--wash)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} aria-busy={loading} className="btn-ink w-full justify-center disabled:opacity-50">
        {loading ? "Signing in…" : "Sign in"}
        {!loading && <ArrowRight size={15} />}
      </button>
    </form>
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
        <Suspense fallback={<a href="/auth/login" className="btn-ink w-full justify-center">Continue with Auth0</a>}>
          <Auth0Cta />
        </Suspense>
      </div>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>or use email and password</span>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <Suspense fallback={<p className="mt-7 text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>}>
        <LoginForm />
      </Suspense>

      <Suspense fallback={null}>
        <GitHubSignInButton />
      </Suspense>

      <p className="mt-7 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        New here?{" "}
        <Link prefetch={false} href="/register" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
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
