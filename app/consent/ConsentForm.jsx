"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ConsentForm({ termsVersion, privacyVersion, next = "/student" }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!accepted) {
      setError("Accept the Terms and Privacy notice to continue.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/consent", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error?.message || "Could not save your acceptance.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <div
        className="rounded-lg border p-4 text-sm leading-6"
        style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text-muted)" }}
      >
        <p>
          You are accepting Terms version <strong style={{ color: "var(--text)" }}>{termsVersion}</strong>{" "}
          and Privacy notice version <strong style={{ color: "var(--text)" }}>{privacyVersion}</strong>.
          Read the full{" "}
          <Link prefetch={false} href="/terms" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Terms
          </Link>{" "}
          and{" "}
          <Link prefetch={false} href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Privacy notice
          </Link>
          .
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm leading-6" style={{ color: "var(--text)" }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>I have read and accept the current Terms and Privacy notice.</span>
      </label>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-ink w-full justify-center">
        {loading ? "Saving…" : "Accept and continue"}
      </button>
    </form>
  );
}
