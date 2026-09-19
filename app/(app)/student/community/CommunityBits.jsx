"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FLAG_REASONS } from "@/lib/community";

const FLAG_OPTIONS = FLAG_REASONS.map((value) => ({
  value,
  label: value === "off-topic" ? "Off-topic" : value[0].toUpperCase() + value.slice(1)
}));

export function VoteButton({ targetType, targetId, count, initialVoted = false }) {
  const router = useRouter();
  const [n, setN] = useState(count || 0);
  const [voted, setVoted] = useState(!!initialVoted);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function vote() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    const prevVoted = voted;
    const prevN = n;
    const nextVoted = !prevVoted;
    // Optimistic update; reconciled or reverted below.
    setVoted(nextVoted);
    setN(prevN + (nextVoted ? 1 : -1));
    try {
      const res = await fetch("/api/community/votes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId })
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error?.message || "Vote failed");
      const serverVoted = !!data.data?.voted;
      setVoted(serverVoted);
      // Keep the optimistic count when the server agrees, else revert.
      setN(serverVoted === nextVoted ? prevN + (nextVoted ? 1 : -1) : prevN);
      router.refresh();
    } catch (e) {
      setVoted(prevVoted);
      setN(prevN);
      setMsg(e?.message || "Vote failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-start gap-1">
      <button
        onClick={vote}
        disabled={busy}
        aria-pressed={voted}
        aria-label={voted ? "Remove upvote" : "Upvote"}
        title={voted ? "You upvoted this" : "Upvote"}
        className="shrink-0 rounded-full border px-2.5 py-1 font-mono text-xs transition active:scale-95 disabled:opacity-50 motion-reduce:transform-none"
        style={voted
          ? { borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--text)" }
          : { borderColor: "var(--line)", color: "var(--text-muted)" }}
      >
        ▲ {n}
      </button>
      {msg && <span className="text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function FlagButton({ targetType, targetId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function flag(e) {
    if (e) e.preventDefault();
    if (done || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/community/flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason })
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error?.message || "Flag failed");
      setDone(true);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setMsg(err?.message || "Flag failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>Flagged for review</span>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-expanded="false" className="shrink-0 text-xs underline-offset-2 hover:underline" style={{ color: "var(--danger)" }}>
        Flag
      </button>
    );
  }

  return (
    <form onSubmit={flag} className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Flag content">
      <label className="sr-only" htmlFor={`flag-reason-${targetId}`}>Flag reason</label>
      <select
        id={`flag-reason-${targetId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-w-0 rounded-lg border px-2 py-1 text-xs"
        style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
      >
        {FLAG_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <button type="submit" disabled={busy} aria-busy={busy} className="shrink-0 text-xs font-semibold disabled:opacity-50" style={{ color: "var(--danger)" }}>
        {busy ? "Flagging…" : "Send flag"}
      </button>
      <button type="button" onClick={() => { setOpen(false); setMsg(""); }} className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
        Cancel
      </button>
      {msg && <span className="w-full text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</span>}
    </form>
  );
}
