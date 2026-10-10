"use client";

import { useState } from "react";
import { postJSON, useAction, ActionFeedback } from "@/components/loom/useAction";

export function HideButton({ targetType, targetId, status = "hidden" }) {
  const { busy, msg, error, run } = useAction(() =>
    postJSON("/api/admin/community", "PATCH", { targetType, targetId, status }));
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={busy} onClick={() => run()} className="shrink-0 text-xs disabled:opacity-50" style={{ color: "var(--danger)" }}>
        {busy ? "Saving…" : status === "hidden" ? "Unhide" : "Hide"}
      </button>
      <ActionFeedback msg={busy ? "" : msg} error={busy ? "" : error} />
    </span>
  );
}

export function PinButton({ threadId, pinned }) {
  const { busy, msg, error, run } = useAction(() =>
    postJSON(`/api/community/threads/${threadId}`, "PATCH", { action: "pin", pinned: !pinned }));
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={busy} onClick={() => run()} className="shrink-0 text-xs disabled:opacity-50" style={{ color: "var(--accent)" }}>
        {busy ? "…" : pinned ? "Unpin" : "Pin"}
      </button>
      <ActionFeedback msg={busy ? "" : msg} error={busy ? "" : error} />
    </span>
  );
}

export function WikiReviewButtons({ slug, editId }) {
  const [decision, setDecision] = useState(null);
  const { busy, msg, error, run } = useAction((d) =>
    postJSON(`/api/community/wiki/${slug}`, "PATCH", { action: "review", editId, decision: d }));

  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={busy} onClick={() => { setDecision("approved"); run("approved"); }} className="btn-ink disabled:opacity-50">
        {busy && decision === "approved" ? "Approving…" : "Approve"}
      </button>
      <button disabled={busy} onClick={() => { setDecision("rejected"); run("rejected"); }}
        className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
        {busy && decision === "rejected" ? "Rejecting…" : "Reject"}
      </button>
      <ActionFeedback msg={busy ? "" : msg} error={busy ? "" : error} />
    </span>
  );
}