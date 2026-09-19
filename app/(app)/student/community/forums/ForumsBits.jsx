"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";
import { parseTags } from "@/lib/community";

const DOMAINS = ["general", "ai_ml", "web", "cybersecurity", "dsa", "blockchain"];

export function ThreadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [domain, setDomain] = useState("general");
  const [tags, setTags] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    let data = null;
    try {
      const res = await fetch("/api/community/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, domain, tags: parseTags(tags) })
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: { message: "Network error — try again" } };
    }
    setBusy(false);
    if (!data?.ok) {
      setMsg(data?.error?.message || "Could not post — try again");
      return;
    }
    router.push(`/student/community/forums/${data.data.thread.id}`);
    router.refresh();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="btn-ink" aria-expanded="false">Start a discussion</button>;
  }
  return (
    <form onSubmit={submit} className="mt-4 w-full space-y-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Start a discussion">
      <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        Ask one clear question. What you tried matters more than the title.
      </p>
      <Field label="Question title"><input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={5} maxLength={160} placeholder="How do I approach dynamic programming?" style={inputStyle} aria-label="Question title" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Domain">
          <select value={domain} onChange={(e) => setDomain(e.target.value)} style={inputStyle} aria-label="Domain">
            {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Tags (optional, comma-separated)">
          <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={160} placeholder="dp, recursion" style={inputStyle} aria-label="Tags" />
        </Field>
      </div>
      <Field label="Details — what you tried, where you are stuck"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={8000} placeholder="What I tried, where I am stuck…" style={inputStyle} aria-label="Details" /></Field>
      {msg && <p className="text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="btn-ink disabled:opacity-50" aria-busy={busy}>{busy ? "Posting…" : "Post thread"}</button>
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
    let data = null;
    try {
      const res = await fetch(`/api/community/threads/${threadId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body })
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: { message: "Network error — try again" } };
    }
    setBusy(false);
    if (!data?.ok) {
      setMsg(data?.error?.message || "Could not reply — try again");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3" aria-label="Post a reply">
      <label className="sr-only" htmlFor={`reply-${threadId}`}>Write a helpful reply</label>
      <textarea id={`reply-${threadId}`} value={body} onChange={(e) => setBody(e.target.value)} required rows={3} maxLength={8000} placeholder="Write a helpful reply…" style={inputStyle} />
      {msg && <p className="text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50" aria-busy={busy}>{busy ? "Replying…" : "Post reply"}</button>
    </form>
  );
}

export function SolveButton({ threadId, replyId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function solve() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/community/threads/${threadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "solve", replyId })
      });
      const data = await res.json();
      if (!data?.ok) setMsg(data?.error?.message || "Could not mark — try again");
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      <button disabled={busy} onClick={solve} aria-busy={busy} className="shrink-0 text-xs font-semibold disabled:opacity-50" style={{ color: "var(--accent)" }}>
        {busy ? "Marking…" : "Mark as solution"}
      </button>
      {msg && <span className="text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}
