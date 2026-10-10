"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Single JSON transport for every mutating control in the app.
 *
 * Never throws, never assumes a JSON body comes back, and always resolves to
 * the `{ ok, data | error }` envelope shape — including on a 500 that renders
 * HTML. Controls that call `res.json()` directly used to wedge permanently
 * (an unguarded `await` on a throwing body skips the `setBusy(false)` below it),
 * or to report success when the write had silently failed.
 */
export async function postJSON(url, method = "POST", body) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    if (data && typeof data === "object" && "ok" in data) return data;
    return {
      ok: false,
      error: { code: "BAD_RESPONSE", message: res.ok ? "Unexpected response from server" : `Request failed (${res.status})` }
    };
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "Network error — try again" } };
  }
}

/**
 * Loading → success/failure feedback for a single mutation.
 *
 * Guarantees `busy` is always released (the caller's `run` is the only thing
 * that can throw, and it is wrapped), and always reports a human message for
 * failures instead of rendering a change the database never accepted.
 */
export function useAction(fn, { refresh = true } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function run(...args) {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const data = await fn(...args);
      if (data?.ok) {
        setMsg("Done");
        if (refresh) router.refresh();
      } else {
        setError(data?.error?.message || "Something went wrong — nothing was saved");
      }
      return data;
    } catch {
      setError("Network error — nothing was saved");
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  return { busy, msg, error, run };
}

/** Standard inline feedback line. Renders nothing when there is nothing to say. */
export function ActionFeedback({ msg, error }) {
  if (error) {
    return <span role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>;
  }
  if (msg) {
    return <span className="text-xs" style={{ color: "var(--accent)" }}>{msg} ✓</span>;
  }
  return null;
}