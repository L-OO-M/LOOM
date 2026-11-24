"use client";

import { useEffect, useState } from "react";
import { setAnalyticsOptOut } from "@/lib/track-client";

/**
 * Usage telemetry opt-out and tour replay.
 *
 * The server preference is authoritative for signed-in pages; localStorage is a
 * mirror so the tracker stops immediately on this device, even before the PATCH
 * response returns. Private browsing with storage disabled still gets the
 * server-side exclusion.
 */
export function UsagePanel({ profile }) {
  const [optedOut, setOptedOut] = useState(!!profile?.analytics_opt_out);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [browserBlocks, setBrowserBlocks] = useState(false);

  useEffect(() => {
    setBrowserBlocks(
      typeof navigator !== "undefined" &&
        (!!navigator.globalPrivacyControl || navigator.doNotTrack === "1" || window.doNotTrack === "1")
    );
  }, []);

  async function toggle() {
    const next = !optedOut;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analyticsOptOut: next })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error?.message || "Could not save that preference.");
        return;
      }
      setOptedOut(next);
      setAnalyticsOptOut(next);
      setMessage(next ? "Usage analytics is off for your account." : "Usage analytics is on.");
    } catch {
      setError("Network error - nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Usage analytics</p>
          <p className="narrative mt-1 text-sm">
            Aggregate page and tour data, used to find confusing screens. No query strings, no free text,
            no third-party scripts.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={!optedOut}
          className="rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-60"
          style={{ borderColor: optedOut ? "var(--line)" : "var(--accent)", color: optedOut ? "var(--text-muted)" : "var(--accent)" }}
        >
          {busy ? "Saving..." : optedOut ? "Turn analytics on" : "Turn analytics off"}
        </button>
      </div>
      {browserBlocks ? (
        <p className="meta mt-2">Your browser sends Global Privacy Control or Do Not Track, so analytics stays off here regardless of this setting.</p>
      ) : null}
      {message ? <p role="status" className="meta mt-2" style={{ color: "var(--accent)" }}>{message}</p> : null}
      {error ? <p role="alert" className="meta mt-2" style={{ color: "var(--danger)" }}>{error}</p> : null}
      <p className="meta mt-3">
        New here?{" "}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("loom:start-tour", { detail: { area: "student" } }))}
          className="font-semibold hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Replay the workspace walkthrough
        </button>
        . Each page also explains itself once on first visit.
      </p>
    </div>
  );
}
