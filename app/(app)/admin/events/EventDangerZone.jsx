"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PHRASE = "DELETE ALL EVENTS";

// The escape hatch the chapter console was missing: a seeded chapter can clear
// its demonstration calendar in one confirmed action. It is deliberately loud -
// a typed phrase, a destructive-coloured button, and a result that says how
// many rows were deleted versus archived because they carried history or a
// live registration.
export function EventDangerZone({ total = 0 }) {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function deleteAll() {
    if (phrase.trim() !== PHRASE) return;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const res = await fetch("/api/admin/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: PHRASE })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not clear the calendar.");
        return;
      }
      setResult(data.data);
      setPhrase("");
      router.refresh();
    } catch {
      setError("Network error - nothing was deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aled-panel" style={{ borderColor: "var(--danger)" }}>
      <p className="aled-panel-title" style={{ color: "var(--danger)" }}>Clear the calendar</p>
      <p className="aled-meta" style={{ marginTop: "0.35rem" }}>
        Deletes every event in this chapter that has no approval history and no live registration.
        Events that have either are archived instead, so the governance trail and student seats are kept.
        {total > 0 ? ` ${total} event${total === 1 ? "" : "s"} in this chapter.` : ""}
      </p>
      <label className="mt-3 block text-xs" style={{ color: "var(--text-muted)" }}>
        Type <strong style={{ color: "var(--text)" }}>{PHRASE}</strong> to confirm
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button
        type="button"
        onClick={deleteAll}
        disabled={busy || phrase.trim() !== PHRASE}
        className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
      >
        {busy ? "Clearing..." : "Delete all events"}
      </button>
      {result && (
        <p role="status" className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Deleted {result.deleted} event{result.deleted === 1 ? "" : "s"}.
          {result.archived > 0 ? ` Archived ${result.archived} with history or registrations.` : ""}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{error}</p>
      )}
    </div>
  );
}
