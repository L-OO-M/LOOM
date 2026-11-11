"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProjectSubmitPanel({ projectId, hasRepo, state, status }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const inReview = status === "in_review";
  const verified = state === "verified";
  const rejected = state === "rejected";

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Could not submit the project.");
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setMsg("Network error — the project was not submitted.");
    } finally {
      setBusy(false);
    }
  }

  if (verified) return null;

  return (
    <section aria-label="Submit for review" className="mt-8 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>
        {inReview ? "In review" : rejected ? "Review declined" : "Submit for verification"}
      </h2>
      <p className="narrative mt-2 text-sm">
        {inReview
          ? "A chapter lead is checking the repository and plan. You can keep editing the project while it waits."
          : rejected
            ? "A lead could not verify the last submission. Address the note, then submit again."
            : "A lead reviews the repository and milestones. Verified work can become a signed credential."}
      </p>
      {!hasRepo && <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>Link a GitHub repository before submitting.</p>}
      {inReview ? (
        <p className="mt-3 text-xs font-semibold" style={{ color: "var(--accent)" }}>Awaiting review — no action needed.</p>
      ) : (
        <>
          <label className="mt-3 block">
            <span className="meta">Note for the reviewer (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
              placeholder="What should the reviewer look at first?"
            />
          </label>
          <button type="button" onClick={submit} disabled={!hasRepo || busy} className="btn-ink mt-3 !py-2 text-xs disabled:opacity-50">
            {busy ? "Submitting…" : "Submit for review"}
          </button>
        </>
      )}
      {msg && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </section>
  );
}
