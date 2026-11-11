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
      { status: "scheduled", label: "Reschedule", tone: "quiet", reschedule: true },
      { status: "completed", label: "Mark completed", tone: "primary" },
      { status: "cancelled", label: "Cancel", tone: "quiet" }
    ]
  },
  student: {
    requested: [{ status: "cancelled", label: "Withdraw", tone: "quiet" }],
    scheduled: [
      { status: "scheduled", label: "Reschedule", tone: "quiet", reschedule: true },
      { status: "cancelled", label: "Cancel", tone: "quiet" }
    ]
  }
};

function localInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

// The mentor/student lifecycle was read-only: a request could be created and
// never accepted, completed, or cancelled. These buttons drive the single
// tenant-scoped transition endpoint.
export function SessionActions({ session }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [when, setWhen] = useState(() => localInputValue(session.scheduled_at));
  const actions = ACTIONS[session.role]?.[session.status] || [];
  if (actions.length === 0) return null;

  async function run(status, reschedule = false) {
    if (reschedule && !when) {
      setError("Choose a new date and time first.");
      return;
    }
    setBusy(status + (reschedule ? "-reschedule" : ""));
    setError("");
    try {
      const res = await fetch(`/api/mentorship/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          ...(reschedule ? { scheduledAt: new Date(when).toISOString() } : {})
        })
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

  const canReschedule = actions.some((a) => a.reschedule);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {canReschedule && (
        <label className="inline-flex items-center gap-1.5">
          <span className="sr-only">New date and time</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="rounded-full border px-2.5 py-1.5 text-xs"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
          />
        </label>
      )}
      {actions.map((a) => {
        const key = a.status + (a.reschedule ? "-reschedule" : "");
        return (
          <button
            key={key}
            type="button"
            onClick={() => run(a.status, Boolean(a.reschedule))}
            disabled={Boolean(busy)}
            className={a.tone === "primary"
              ? "btn-ink !px-3 !py-1.5 text-xs"
              : "rounded-full border px-3 py-1.5 text-xs font-semibold"}
            style={a.tone === "primary" ? undefined : { borderColor: "var(--line)", color: "var(--text-muted)" }}
          >
            {busy === key ? "Saving…" : a.label}
          </button>
        );
      })}
      {error && <span role="alert" className="meta" style={{ color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}
