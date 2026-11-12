"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export default function ProjectReviewActions({ projectId, title, state = "provisional" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function decide(decision) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/ranking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "project", id: projectId, decision })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "That did not work.");
        return;
      }
      router.refresh();
    } catch {
      setMsg("Network error — nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {state !== "verified" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("verified")}
          className="aled-tag aled-tag--accent disabled:opacity-50"
          title={`Verify ${title}`}
        >
          <Check size={12} aria-hidden="true" /> Verify
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => decide("rejected")}
        className="aled-tag disabled:opacity-50"
        title={`${state === "verified" ? "Revoke" : "Decline"} ${title}`}
      >
        <X size={12} aria-hidden="true" /> {state === "verified" ? "Revoke" : "Decline"}
      </button>
      {msg && <span className="aled-meta" role="alert" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}
