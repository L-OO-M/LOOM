"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["draft", "published", "open", "active", "closed"];

// The admin workspace could create and read contests but never close one; the
// only status control lived on the lead surface. This is the admin equivalent,
// pinned to the same tenant-checked endpoint the page already reads from.
export function ContestStatusControl({ id, status, title }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(e) {
    const next = e.target.value;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/contests", {
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
      <select
        value={status}
        onChange={change}
        disabled={busy}
        aria-label={`Status for ${title}`}
        className="aled-select"
        style={{ padding: "0.3rem 0.4rem" }}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {error && <span role="alert" className="aled-meta" style={{ color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}
