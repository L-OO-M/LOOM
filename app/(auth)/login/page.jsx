"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { signIn } from "@/lib/auth-client";
import { homeForRole } from "@/lib/auth";
import { LevelGuide } from "@/app/(auth)/_components/LevelGuide";
import GitHubSignInButton from "@/app/(auth)/_components/GitHubSignInButton";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
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

  const input = "mt-1 block min-h-[44px] w-full rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <div>
        <label className="block text-sm font-medium" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          placeholder="student@college.edu"
          aria-describedby={error ? "login-err" : undefined}
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
      </div>
      {error && <p id="login-err" role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="btn-ink w-full justify-center disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main id="main" className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-12" style={{ background: "var(--bg)" }}>
      <div className="ambient-wash" aria-hidden="true" />
      <span className="ghost-type left-1/2 top-10 -translate-x-1/2 text-[4.5rem] sm:text-[6rem] lg:text-[9rem]" aria-hidden="true">LOOM</span>
      <div className="card-sheen relative w-full max-w-md rounded-2xl border border-[var(--line)] p-8" style={{ background: "var(--bg-elevated)" }}>
        <BrandMark size={34} />
        <div className="rule-gold mt-5 w-16" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          One login for students and admins. Admins claim access once at setup.
        </p>
        {/* Auth0 front door. Labeled to avoid colliding with the email/password
            form's "Sign in" / "Register" affordances below. */}
        <div className="mt-6 space-y-3">
          <a href="/auth/login" className="btn-ink w-full justify-center">Continue with Auth0</a>
          <a href="/auth/login?screen_hint=signup" className="btn-ghost w-full justify-center">Create an account</a>
        </div>
        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1" style={{ background: "var(--line)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>or use email and password</span>
          <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        </div>
        <Suspense fallback={<div className="mt-8 text-sm text-[var(--text-muted)]">Loading...</div>}>
          <LoginForm />
        </Suspense>
        <Suspense fallback={null}>
          <GitHubSignInButton />
        </Suspense>
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          No account?{" "}
          <Link href="/register" className="font-medium text-[var(--accent)] hover:underline">Register</Link>
        </p>
        <p className="mt-3 text-center text-xs leading-5 text-[var(--text-muted)]">
          Admin? Same login — then visit <Link href="/setup" className="font-medium text-[var(--accent)] hover:underline">/setup</Link> once to claim admin.
        </p>
        <LevelGuide compact />
      </div>
    </main>
  );
}
