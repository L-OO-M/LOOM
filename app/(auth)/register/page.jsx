"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { AuthField, AuthShell, authInputClass } from "@/app/(auth)/_components/AuthShell";
import GitHubSignInButton from "@/app/(auth)/_components/GitHubSignInButton";
import { PRIMARY_DOMAINS, domainLabel } from "@/lib/domains";

// Derived from the single source of truth instead of a second hardcoded copy.
// This list had drifted: it was missing `embedded`, so a student on the biggest
// roadmap in the catalogue (144 nodes) could not pick their own track at signup.
const DOMAINS = PRIMARY_DOMAINS.map((slug) => [slug, domainLabel(slug)]);

function ConsentBox({ checked, onChange, error }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
      {/* The visible box stays 20px, but the input itself spans the full 44px tap
          target. An opacity-0 input keeps native checkbox semantics, keyboard
          focus, and screen-reader behavior. */}
      <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={!!error}
          className="peer absolute inset-0 size-11 cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="grid size-5 place-items-center rounded-md border transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]"
          style={
            checked
              ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314" }
              : { borderColor: "var(--line)", background: "transparent", color: "transparent" }
          }
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      <span>
        I have read the{" "}
        <Link prefetch={false} href="/privacy" className="font-medium hover:underline" style={{ color: "var(--accent)" }}>Privacy notice</Link>{" "}
        and{" "}
        <Link prefetch={false} href="/terms" className="font-medium hover:underline" style={{ color: "var(--accent)" }}>Terms</Link>.
      </span>
    </label>
  );
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const [domains, setDomains] = useState([]);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(true);

  function toggleDomain(slug) {
    setDomains((d) => (d.includes(slug) ? d.filter((x) => x !== slug) : [...d, slug]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!accepted) {
      setError("Please read and accept the Privacy notice and Terms before creating an account.");
      return;
    }
    setLoading(true);

    const yearNum = year === "" ? null : Number(year);
    const { data, error: signUpError } = await signUp(email, password, {
      name,
      roll_number: rollNumber || null,
      branch: branch || null,
      year: Number.isInteger(yearNum) && yearNum >= 1 && yearNum <= 6 ? yearNum : null,
      domains,
      terms_accepted_at: new Date().toISOString()
    });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Self-detect instead of hardcoding "check your email". With Supabase's
    // "Confirm Email" ON, signUp returns no session until the link is clicked.
    // With it OFF (which is how the chapter runs, to avoid the built-in SMTP
    // rate limit) the session is returned immediately — so telling the user to
    // go read their inbox would be a lie.
    setNeedsConfirm(!data?.session);
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <AuthShell>
        <p className="kicker">{needsConfirm ? "One more step" : "Account ready"}</p>
        <h1 className="font-display mt-3 text-3xl font-medium tracking-tight" style={{ color: "var(--text)" }}>
          {needsConfirm ? "Check your email" : "You're in"}
        </h1>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          {needsConfirm ? (
            <>We sent a confirmation link to <strong style={{ color: "var(--text)" }}>{email}</strong>. Open it to activate your account, then sign in.</>
          ) : (
            <>Your account is created and you are signed in. Pick your first domain to get a roadmap.</>
          )}
        </p>
        <div className="mt-7 space-y-3">
          {!needsConfirm && (
            <Link prefetch={false} href="/student/onboarding" className="btn-ink w-full justify-center">
              Start onboarding
            </Link>
          )}
          <Link prefetch={false} href="/login" className={`${needsConfirm ? "btn-ink" : "btn-ghost"} w-full justify-center`}>
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="kicker">Join the chapter</p>
      <h1 className="font-display mt-3 text-3xl font-medium tracking-tight" style={{ color: "var(--text)" }}>
        Create account
      </h1>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        Register with your college email. Every domain is open to join instantly.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <AuthField id="name" label="Full name">
          <input id="name" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
            className={authInputClass} style={{ borderColor: "var(--line)", color: "var(--text)" }} />
        </AuthField>

        <AuthField id="email" label="Email">
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className={authInputClass} style={{ borderColor: "var(--line)", color: "var(--text)" }} placeholder="student@college.edu" />
        </AuthField>

        <AuthField id="password" label="Password" hint="At least 6 characters">
          <input id="password" type="password" required minLength={6} autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass} style={{ borderColor: "var(--line)", color: "var(--text)" }} />
        </AuthField>

        <div className="grid grid-cols-2 gap-3">
          <AuthField id="roll" label="Roll number" hint="Optional">
            <input id="roll" type="text" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)}
              className={authInputClass} style={{ borderColor: "var(--line)", color: "var(--text)" }} />
          </AuthField>
          <AuthField id="year" label="Year" hint="1–6">
            <input id="year" type="number" min={1} max={6} value={year} onChange={(e) => setYear(e.target.value)}
              className={authInputClass} style={{ borderColor: "var(--line)", color: "var(--text)" }} />
          </AuthField>
        </div>

        <AuthField id="branch" label="Branch" hint="Optional">
          <input id="branch" type="text" value={branch} onChange={(e) => setBranch(e.target.value)}
            className={authInputClass} style={{ borderColor: "var(--line)", color: "var(--text)" }} placeholder="e.g. CSE" />
        </AuthField>

        <fieldset>
          <legend className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Domains of interest
            <span className="ml-1.5 font-normal" style={{ color: "var(--text-muted)" }}>(join instantly)</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DOMAINS.map(([slug, label]) => {
              const on = domains.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleDomain(slug)}
                  aria-pressed={on}
                  className="inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-2 text-xs font-semibold transition active:scale-97"
                  style={on
                    ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314" }
                    : { borderColor: "var(--line)", color: "var(--text-muted)" }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <ConsentBox checked={accepted} onChange={setAccepted} error={error} />

        {error && (
          <p role="alert" className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--wash)" }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} aria-busy={loading} className="btn-ink w-full justify-center disabled:opacity-50">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <Suspense fallback={null}>
        <GitHubSignInButton label="Sign up with GitHub" />
      </Suspense>

      <p className="mt-7 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Already registered?{" "}
        <Link prefetch={false} href="/login" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
