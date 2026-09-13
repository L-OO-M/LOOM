"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function patch(url, body) {
  const res = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function HideButton({ targetType, targetId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => {
      setBusy(true);
      await patch("/api/admin/community", { targetType, targetId, status: "hidden" });
      setBusy(false);
      router.refresh();
    }} className="shrink-0 text-xs disabled:opacity-50" style={{ color: "var(--danger)" }}>
      {busy ? "Hiding…" : "Hide"}
    </button>
  );
}

export function PinButton({ threadId, pinned }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => {
      setBusy(true);
      await patch(`/api/community/threads/${threadId}`, { action: "pin", pinned: !pinned });
      setBusy(false);
      router.refresh();
    }} className="shrink-0 text-xs disabled:opacity-50" style={{ color: "var(--accent)" }}>
      {busy ? "…" : pinned ? "Unpin" : "Pin"}
    </button>
  );
}

export function WikiReviewButtons({ slug, editId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(decision) {
    setBusy(true);
    await patch(`/api/community/wiki/${slug}`, { action: "review", editId, decision });
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="flex gap-2">
      <button disabled={busy} onClick={() => decide("approved")} className="btn-ink disabled:opacity-50">Approve</button>
      <button disabled={busy} onClick={() => decide("rejected")} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Reject</button>
    </span>
  );
}
