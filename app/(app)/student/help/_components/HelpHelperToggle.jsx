"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Opt in / out of the peer-helper pool.
//
// The opt-out endpoint (/api/help/profile) has existed since migration 028 but
// nothing in the UI ever called it, while lib/auth-server.js enrolled every
// authenticated member as an available helper on every request. This is the
// control that was missing.
//
// The failure result is surfaced inline rather than swallowed: the previous
// admin toggle pattern showed a 403 and a success identically, which is how a
// security control can appear to have flipped when nothing was written.
export function HelpHelperToggle({ available, topics = [] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/help/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ available: !available, topics })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Couldn't update your availability.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        aria-pressed={available}
        className="btn-ink justify-center disabled:opacity-50"
      >
        {busy ? "Saving…" : available ? "Stop being a helper" : "Offer to help"}
      </button>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}