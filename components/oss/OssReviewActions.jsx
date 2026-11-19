"use client";

import { useState } from "react";
import { postJSON, ActionFeedback } from "@/components/loom/useAction";

/**
 * One compact grade control for a society-challenge submission.
 *
 * Approve is only enabled after GitHub has verified the fork: a lead grades
 * work, they do not also have to adjudicate ownership. Rejection always works
 * and never penalises the member, so a reviewer can return a bad attempt
 * without hesitation.
 */
export function OssReviewActions({ id, verificationStatus }) {
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState(null);
  const { busy, msg, error, run } = useAction((payload) =>
    postJSON(`/api/challenges/oss/${id}`, "PATCH", payload)
  );
  const verified = verificationStatus === "verified";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={2000}
        placeholder="Feedback for the member (required)"
        aria-label="Review feedback"
        disabled={busy}
        className="min-w-[12rem] flex-1 rounded-lg border px-2 py-1.5 text-xs"
        style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
      />
      <button
        type="button"
        disabled={busy || !verified || note.trim().length < 5}
        title={verified ? "Approve and score this fix" : "GitHub has not verified this fork yet"}
        onClick={() => {
          setDecision("approved");
          run({ decision: "approved", feedback: note.trim() });
        }}
        className="btn-ink !py-1.5 text-xs disabled:opacity-50"
      >
        {busy && decision === "approved" ? "Approving…" : "Approve + score"}
      </button>
      <button
        type="button"
        disabled={busy || note.trim().length < 5}
        onClick={() => {
          setDecision("rejected");
          run({ decision: "rejected", feedback: note.trim() });
        }}
        className="rounded-xl border px-3 py-1.5 text-xs disabled:opacity-50"
        style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
      >
        {busy && decision === "rejected" ? "Returning…" : "Return"}
      </button>
      <ActionFeedback msg={busy ? "" : msg} error={busy ? "" : error} />
    </div>
  );
}
