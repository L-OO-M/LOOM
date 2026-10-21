"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["draft", "published", "open", "active", "closed"];

export function ChallengeStatus({ id, status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(e) {
    const next = e.target.value;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/contests/manage", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: next })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not update");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="mono-tag inline-flex items-center gap-1.5">
        Status
        <select
          value={status}
          onChange={change}
          disabled={busy}
          aria-label="Challenge status"
          className="rounded-md border px-1.5 py-0.5 text-xs"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      {error && <span role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}
