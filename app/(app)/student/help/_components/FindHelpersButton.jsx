"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Nominate helpers for one of my own help requests.
//
// The failure is surfaced inline rather than swallowed. A silent failure here is
// how a student concludes "I asked for help and nothing happened" — the exact
// dead end this page exists to remove.
export function FindHelpersButton({ signalId, pending = false }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/help/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signal_id: signalId })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg({ tone: "error", text: data.error?.message || "Couldn't reach helpers." });
        return;
      }
      const found = data.data?.helpers?.length ?? 0;
      setMsg(
        found > 0
          ? { tone: "ok", text: `Notified ${found} helper${found === 1 ? "" : "s"}.` }
          : { tone: "warn", text: "No helpers available yet — try mentorship or the forums." }
      );
      router.refresh();
    } catch {
      setMsg({ tone: "error", text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        className="btn-ink disabled:opacity-50"
      >
        {busy ? "Notifying…" : pending ? "Notify more helpers" : "Find helpers"}
      </button>
      {msg && (
        <p
          role="status"
          className="max-w-[16rem] text-right text-xs"
          style={{ color: msg.tone === "error" ? "var(--danger)" : msg.tone === "warn" ? "var(--text-muted)" : "var(--accent)" }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}