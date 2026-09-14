"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Review a mentor application on its evidence trail. Approval promotes the
// student to mentor immediately; both paths notify the applicant.
export function ReviewButtons({ applicationId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");

  async function decide(decision) {
    setBusy(decision);
    setMsg("");
    try {
      const res = await fetch("/api/admin/mentor-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: applicationId, decision })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Couldn't save. Try again.");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setMsg("Couldn't reach the server. Try again.");
      setBusy(null);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={() => decide("approved")}
        disabled={busy}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-50"
        style={{ background: "var(--text)", color: "var(--bg)" }}
      >
        {busy === "approved" ? "Approving…" : "Approve → mentor"}
      </button>
      <button
        onClick={() => decide("rejected")}
        disabled={busy}
        className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-50"
        style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
      >
        {busy === "rejected" ? "Saving…" : "Decline"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}
