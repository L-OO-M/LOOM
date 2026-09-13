"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

const DOMAINS = ["general", "ai_ml", "web", "cybersecurity", "dsa", "blockchain"];

export function NewPageForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [domain, setDomain] = useState("general");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/community/wiki", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, content, domain })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.push(`/student/community/wiki/${data.data.page.slug}`);
    router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-ink">New page</button>;
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={160} style={inputStyle} /></Field>
      <Field label="Domain">
        <select value={domain} onChange={(e) => setDomain(e.target.value)} style={inputStyle}>
          {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="Content (markdown)"><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} maxLength={20000} style={inputStyle} /></Field>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Creating…" : "Create page"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Cancel</button>
      </div>
    </form>
  );
}

export function SuggestForm({ slug, isAdmin }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/community/wiki/${slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "suggest", content, reason })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setContent("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field label={isAdmin ? "Edit content directly (admin)" : "Propose new content (goes to review)"}>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={5} maxLength={20000} style={inputStyle} />
      </Field>
      {!isAdmin && (
        <Field label="Why this change?"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Fixes the outdated install steps" style={inputStyle} /></Field>
      )}
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Saving…" : isAdmin ? "Apply edit" : "Submit for review"}</button>
    </form>
  );
}
