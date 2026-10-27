"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACTIONS = {
  mentor: {
    requested: [
      { status: "scheduled", label: "Accept", tone: "primary" },
      { status: "cancelled", label: "Decline", tone: "quiet" }
    ],
    scheduled: [
      { status: "completed", label: "Mark completed", tone: "primary" },
      { status: "cancelled", label: "Cancel", tone: "quiet" }
    ]
  },
  student: {
    requested: [{ status: "cancelled", label: "Withdraw", tone: "quiet" }],
    scheduled: [{ status: "cancelled", label: "Cancel", tone: "quiet" }]
  }
};

// The mentor/student lifecycle was read-only: a request could be created and
// never accepted, completed, or cancelled. These buttons drive the single
// tenant-scoped transition endpoint.
export function SessionActions({ session }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const actions = ACTIONS[session.role]?.[session.status] || [];
  if (actions.length === 0) return null;

  async function run(status) {
    setBusy(status);
    setError("");
    try {
      const res = await fetch(`/api/mentorship/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not update the session.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — the session was not updated.");
    } finally {
      setBusy("");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {actions.map((a) => (
        <button
          key={a.status}
          type="button"
          onClick={() => run(a.status)}
          disabled={Boolean(busy)}
          className={a.tone === "primary"
            ? "btn-ink !px-3 !py-1.5 text-xs"
            : "rounded-full border px-3 py-1.5 text-xs font-semibold"}
          style={a.tone === "primary" ? undefined : { borderColor: "var(--line)", color: "var(--text-muted)" }}
        >
          {busy === a.status ? "Saving…" : a.label}
        </button>
      ))}
      {error && <span role="alert" className="meta" style={{ color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}
