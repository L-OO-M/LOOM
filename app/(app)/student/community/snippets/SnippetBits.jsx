"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";
import { parseTags } from "@/lib/community";

const FALLBACK_LANGUAGES = ["javascript", "python", "sql", "css", "bash", "typescript", "java", "c", "cpp", "go", "rust", "other"];

export function CopyButton({ code }) {
  const [msg, setMsg] = useState("");

  async function copy() {
    setMsg("");
    try {
      if (!navigator?.clipboard?.writeText) throw new Error("unsupported");
      await navigator.clipboard.writeText(code || "");
      setMsg("Copied ✓");
    } catch {
      setMsg("Copy failed");
    }
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <button
        onClick={copy}
        aria-label="Copy snippet code"
        className="rounded-full border px-2.5 py-1 text-xs font-semibold transition active:scale-95"
        style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
      >
        Copy
      </button>
      {msg && <span className="font-mono text-[11px]" role="status" style={{ color: "var(--text-muted)" }}>{msg}</span>}
    </span>
  );
}

export function SnippetForm({ languages = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [customLanguage, setCustomLanguage] = useState("");
  const [domain, setDomain] = useState("general");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const options = Array.from(new Set([...(languages || []), ...FALLBACK_LANGUAGES])).slice(0, 30);
  const effectiveLanguage = language === "other" ? customLanguage.trim().toLowerCase().slice(0, 30) : language;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    let data = null;
    try {
      const res = await fetch("/api/community/snippets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, code, language: effectiveLanguage || "other", domain, description, tags: parseTags(tags) })
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: { message: "Network error — try again" } };
    }
    setBusy(false);
    if (!data?.ok) {
      setMsg(data?.error?.message || "Could not share — try again");
      return;
    }
    setTitle("");
    setCode("");
    setDescription("");
    setTags("");
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-ink" aria-expanded="false">Share a snippet</button>;
  return (
    <form onSubmit={submit} className="mt-4 w-full space-y-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Share a snippet">
      <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        Share the helper you keep rewriting. Small, working, reusable.
      </p>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} placeholder="Debounced search hook" style={inputStyle} aria-label="Title" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Language">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inputStyle} aria-label="Language">
            {options.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Domain">
          <select value={domain} onChange={(e) => setDomain(e.target.value)} style={inputStyle} aria-label="Domain">
            {["general", "ai_ml", "web", "cybersecurity", "dsa", "blockchain"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>
      {language === "other" && (
        <Field label="Custom language"><input value={customLanguage} onChange={(e) => setCustomLanguage(e.target.value)} required maxLength={30} placeholder="e.g. lua" style={inputStyle} aria-label="Custom language" /></Field>
      )}
      <Field label="Code"><textarea value={code} onChange={(e) => setCode(e.target.value)} required rows={6} maxLength={8000} spellCheck={false} placeholder="Paste working code…" className="font-mono" style={inputStyle} aria-label="Code" /></Field>
      <Field label="What it does (optional)"><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="When to reach for this…" style={inputStyle} aria-label="Description" /></Field>
      <Field label="Tags (optional, comma-separated)"><input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={160} placeholder="hooks, search" style={inputStyle} aria-label="Tags" /></Field>
      {msg && <p className="text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="btn-ink disabled:opacity-50" aria-busy={busy}>{busy ? "Sharing…" : "Share snippet"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>Cancel</button>
      </div>
    </form>
  );
}
