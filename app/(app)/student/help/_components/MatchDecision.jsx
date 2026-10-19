"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Accept or decline a help request I was nominated for.
//
// The requester's identity is never sent to or shown by this component: the
// helper sees only what is blocked, which is what the matching query returns.
export function MatchDecision({ matchId }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function decide(status) {
    setBusy(status);
    setError("");
    try {
      const res = await fetch(`/api/help/matches/${matchId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Couldn't save your answer.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => decide("accepted")}
          disabled={!!busy}
          aria-busy={busy === "accepted"}
          className="btn-ink disabled:opacity-50"
        >
          {busy === "accepted" ? "Saving…" : "I can help"}
        </button>
        <button
          type="button"
          onClick={() => decide("declined")}
          disabled={!!busy}
          aria-busy={busy === "declined"}
          className="btn-ghost disabled:opacity-50"
        >
          {busy === "declined" ? "Saving…" : "Decline"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}