"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

export function SnippetForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/community/snippets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, code, language, description })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setTitle("");
    setCode("");
    setDescription("");
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-ink">Share a snippet</button>;
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} placeholder="Debounced search hook" style={inputStyle} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Language"><input value={language} onChange={(e) => setLanguage(e.target.value)} required maxLength={30} style={inputStyle} /></Field>
      </div>
      <Field label="Code"><textarea value={code} onChange={(e) => setCode(e.target.value)} required rows={6} maxLength={8000} spellCheck={false} className="font-mono" style={inputStyle} /></Field>
      <Field label="What it does (optional)"><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} style={inputStyle} /></Field>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-ink disabled:opacity-50">{busy ? "Sharing…" : "Share snippet"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Cancel</button>
      </div>
    </form>
  );
}
