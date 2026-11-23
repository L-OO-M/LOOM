"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CLOSURE_PHRASE } from "@/lib/account-closure";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

const CONSEQUENCES = [
  "Your public card, handle, bio and social links are removed.",
  "Your GitHub connection is unlinked, so the handle can belong to someone else.",
  "You leave every department seat and any open seat request is withdrawn.",
  "You are removed from the mentor list, so no one can book a session with you.",
  "Your name on past work and contributions becomes “Former member”. The work itself stays on the chapter's record.",
  "You are signed out. The account cannot be used again until an admin restores it."
];

/**
 * The self-service closure control. Collapsed by default so a mis-click cannot
 * reach a destructive action; the phrase and the acknowledgement both have to
 * be right, and the server re-checks everything after that.
 */
export default function CloseAccountPanel() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const ready = phrase.trim().toUpperCase() === CLOSURE_PHRASE && ack && !busy;

  async function closeAccount(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/account/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: phrase.trim(), reason: reason.trim() || undefined })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body?.error?.message || "The account could not be closed.");
        return;
      }
      setDone(true);
      // Use the same sign-out form every other surface uses, so the Auth0
      // session is ended rather than only the local cookie.
      document.getElementById("close-account-signout")?.submit();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "transparent" }}
        >
          Close my account
        </button>
      ) : (
        <form
          onSubmit={closeAccount}
          className="space-y-4 rounded-2xl border p-5"
          style={{ borderColor: "var(--danger)", background: "var(--bg-elevated)" }}
        >
          <p className="flex items-start gap-2 text-sm font-semibold" style={{ color: "var(--danger)" }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            This closes your account. It does not erase the chapter&apos;s record of work you did.
          </p>

          <ul className="space-y-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
            {CONSEQUENCES.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true">—</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Optional: why are you leaving?
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Not required. Seen only by an admin."
              style={{ ...input, marginTop: 6 }}
            />
          </label>

          <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Type {CLOSURE_PHRASE} to confirm
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{ ...input, marginTop: 6 }}
            />
          </label>

          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-1"
            />
            <span>I understand this cannot be undone from my side.</span>
          </label>

          {error && <p className="text-sm" role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
          {done && (
            <p className="text-sm" role="status" style={{ color: "var(--accent)" }}>
              Account closed. Signing you out…
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!ready}
              className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--danger)", color: "#fff", border: "none" }}
            >
              {busy ? "Closing…" : "Close my account permanently"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(""); }}
              className="rounded-full border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--line)", color: "var(--text-muted)", background: "transparent" }}
            >
              Keep my account
            </button>
          </div>
        </form>
      )}

      <form id="close-account-signout" action="/auth/signout" method="post" className="hidden" />
    </div>
  );
}
