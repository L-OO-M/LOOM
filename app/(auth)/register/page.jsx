"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { signUp } from "@/lib/auth-client";

const input = "mt-1 block w-full rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm focus:border-[var(--accent)] focus:outline-none";

const DOMAINS = [
  ["ai_ml", "AI / ML"],
  ["web", "Web Dev"],
  ["cybersecurity", "Cybersecurity"],
  ["dsa", "DSA"],
  ["blockchain", "Blockchain"]
];

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const [domains, setDomains] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  function toggleDomain(slug) {
    setDomains((d) => (d.includes(slug) ? d.filter((x) => x !== slug) : [...d, slug]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const yearNum = year === "" ? null : Number(year);
    const { error: signUpError } = await signUp(email, password, {
      name,
      roll_number: rollNumber || null,
      branch: branch || null,
      year: Number.isInteger(yearNum) && yearNum >= 1 && yearNum <= 6 ? yearNum : null,
      domains
    });
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium" htmlFor="roll">Roll number</label>
                  <input id="roll" type="text" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className={input} placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-sm font-medium" htmlFor="year">Year</label>
                  <input id="year" type="number" min={1} max={6} value={year} onChange={(e) => setYear(e.target.value)} className={input} placeholder="1–6" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="branch">Branch</label>
                <input id="branch" type="text" value={branch} onChange={(e) => setBranch(e.target.value)} className={input} placeholder="e.g. CSE" />
              </div>
              <fieldset>
                <legend className="text-sm font-medium">Domains of interest <span className="font-normal text-[var(--text-muted)]">(join instantly — no approval)</span></legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DOMAINS.map(([slug, label]) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => toggleDomain(slug)}
                      aria-pressed={domains.includes(slug)}
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                      style={domains.includes(slug)
                        ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314" }
                        : { borderColor: "var(--line)", color: "var(--text-muted)" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
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
