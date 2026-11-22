"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Approve or decline a seat request. The reason is required to decline: a
// decision with no explanation is what made the old queue useless.
export function DecisionButtons({ id }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);

  async function decide(decision) {
    setError("");
    if (decision === "rejected" && reason.trim().length < 3) {
      setError("Give a reason — the member sees it.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/role-requests/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body?.error?.message || "That decision did not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ink !py-1.5 text-xs"
          disabled={busy}
          onClick={() => decide("approved")}
        >
          Approve
        </button>
        {declining ? (
          <>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why not?"
              className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
            />
            <button
              type="button"
              className="btn-ghost !py-1.5 text-xs"
              disabled={busy}
              onClick={() => decide("rejected")}
            >
              Confirm decline
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-ghost !py-1.5 text-xs"
            disabled={busy}
            onClick={() => setDeclining(true)}
          >
            Decline
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
