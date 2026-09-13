"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { signUp } from "@/lib/auth-client";

const input = "mt-1 block w-full rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signUpError } = await signUp(email, password, { name });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-12" style={{ background: "var(--bg)" }}>
      <div className="ambient-wash" aria-hidden="true" />
      <span className="ghost-type left-1/2 top-10 -translate-x-1/2 text-[9rem]" aria-hidden="true">LOOM</span>
      <div className="card-sheen relative w-full max-w-sm rounded-2xl border border-[var(--line)] p-8" style={{ background: "var(--bg-elevated)" }}>
        <BrandMark size={34} />
        <div className="rule-gold mt-5 w-16" />
        {sent ? (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              We sent a confirmation link to <strong style={{ color: "var(--text)" }}>{email}</strong>. Click it to activate your account, then sign in.
            </p>
            <Link href="/login" className="btn-ink mt-6">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Create account</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Register with your college email
            </p>
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="block text-sm font-medium" htmlFor="name">Full name</label>
                <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={input} />
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="email">Email</label>
                <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="student@college.edu" />
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="password">Password</label>
                <input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="btn-ink w-full justify-center disabled:opacity-50"
              >
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
              Already registered?{" "}
              <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
