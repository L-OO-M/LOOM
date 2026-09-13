"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

const DOMAINS = ["general", "ai_ml", "web", "cybersecurity", "dsa", "blockchain"];

export function ThreadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [domain, setDomain] = useState("general");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/community/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, domain })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.push(`/student/community/forums/${data.data.thread.id}`);
    router.refresh();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="btn-ink">Start a discussion</button>;
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={5} maxLength={160} placeholder="How do I approach dynamic programming?" style={inputStyle} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Domain">
          <select value={domain} onChange={(e) => setDomain(e.target.value)} style={inputStyle}>
            {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Details"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={8000} placeholder="What I tried, where I am stuck…" style={inputStyle} /></Field>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Posting…" : "Post thread"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Cancel</button>
      </div>
    </form>
  );
}

export function ReplyForm({ threadId }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/community/threads/${threadId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={3} maxLength={8000} placeholder="Write a helpful reply…" style={inputStyle} />
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Replying…" : "Post reply"}</button>
    </form>
  );
}

export function SolveButton({ threadId, replyId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function solve() {
    setBusy(true);
    await fetch(`/api/community/threads/${threadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "solve", replyId })
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button disabled={busy} onClick={solve} className="shrink-0 text-xs font-medium disabled:opacity-50" style={{ color: "var(--accent)" }}>
      Mark as solution
    </button>
  );
}
