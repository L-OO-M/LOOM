"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Mentor candidacy application. Eligibility is computed server-side from
// evidence; this form only collects the human parts: what you can teach
// and why you want to.
export function ApplyForm() {
  const router = useRouter();
  const [expertise, setExpertise] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/mentorship/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expertise, statement })
      });
      const data = await res.json();
      if (!data.ok) {
        const reasons = data.error?.details?.reasons;
        setMsg(
          data.error?.code === "NOT_ELIGIBLE" && reasons?.length
            ? `Not yet: ${reasons.join("; ")}.`
            : data.error?.message || "Couldn't submit. Try again."
        );
        setBusy(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setMsg("Couldn't reach the server. Try again.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
        Applied — reviewers judge proof, not promises. You'll hear back here.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block">
        <span className="meta">What can you teach?</span>
        <input
          value={expertise}
          onChange={(e) => setExpertise(e.target.value)}
          placeholder="e.g. React hooks, Git workflows, DSA basics"
          required
          minLength={2}
          maxLength={200}
          className="mt-1.5 w-full rounded-[10px] border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
        />
      </label>
      <label className="block">
        <span className="meta">Why mentor? (a few honest sentences)</span>
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Who helped you, and what will you pass on?"
          required
          minLength={20}
          maxLength={1000}
          rows={3}
          className="mt-1.5 w-full rounded-[10px] border px-3 py-2 text-sm leading-6"
          style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn-ink disabled:opacity-50">
          {busy ? "Sending…" : "Apply to mentor"}
        </button>
        {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
      </div>
    </form>
  );
}
