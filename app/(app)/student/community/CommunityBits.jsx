"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VoteButton({ targetType, targetId, count }) {
  const router = useRouter();
  const [n, setN] = useState(count || 0);
  const [busy, setBusy] = useState(false);

  async function vote() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/community/votes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType, targetId })
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      setN((v) => v + (data.data.voted ? 1 : -1));
      router.refresh();
    }
  }

  return (
    <button onClick={vote} disabled={busy} className="shrink-0 rounded-full border px-2.5 py-1 font-mono text-xs transition active:scale-95 disabled:opacity-50"
      style={{ borderColor: "var(--line)", color: "var(--text-muted)" }} aria-label="Upvote">
      ▲ {n}
    </button>
  );
}

export function FlagButton({ targetType, targetId }) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  async function flag() {
    if (done) return;
    const res = await fetch("/api/community/flags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType, targetId, reason: "spam" })
    });
    const data = await res.json();
    if (data.ok) {
      setDone(true);
      router.refresh();
    }
  }

  return (
    <button onClick={flag} className="shrink-0 text-xs" style={{ color: done ? "var(--text-muted)" : "var(--danger)" }}>
      {done ? "Flagged" : "Flag"}
    </button>
  );
}
