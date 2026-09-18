"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

const DOMAINS = ["general", "ai_ml", "web", "cybersecurity", "dsa", "blockchain"];

export function CopyLinkButton() {
  const [msg, setMsg] = useState("");

  async function copy() {
    setMsg("");
    try {
      const url = window.location.href;
      if (!navigator?.clipboard?.writeText) throw new Error("unsupported");
      await navigator.clipboard.writeText(url);
      setMsg("Copied ✓");
    } catch {
      setMsg("Copy failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={copy} aria-label="Copy link to this page" className="rounded-full border px-2.5 py-1 text-xs font-semibold transition active:scale-95" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
        Copy link
      </button>
      {msg && <span className="text-xs" role="status" style={{ color: "var(--text-muted)" }}>{msg}</span>}
    </span>
  );
}

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
    let data = null;
    try {
      const res = await fetch("/api/community/wiki", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, content, domain })
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: { message: "Network error — try again" } };
    }
    setBusy(false);
    if (!data?.ok) {
      setMsg(data?.error?.message || "Could not create — a page with this title may already exist");
      return;
    }
    router.push(`/student/community/wiki/${data.data.page.slug}`);
    router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-ink" aria-expanded="false">New page</button>;
  return (
    <form onSubmit={submit} className="mt-4 w-full space-y-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="New wiki page">
      <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        Write the guide you wish you&apos;d had. Clear titles become durable URLs.
      </p>
      <Field label="Page title"><input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={160} placeholder="Setting up WSL for DSA" style={inputStyle} aria-label="Page title" /></Field>
      <Field label="Domain">
        <select value={domain} onChange={(e) => setDomain(e.target.value)} style={inputStyle} aria-label="Domain">
          {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="Content"><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} maxLength={20000} placeholder="Steps, gotchas, links…" style={inputStyle} aria-label="Content" /></Field>
      {msg && <p className="text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="btn-ink disabled:opacity-50" aria-busy={busy}>{busy ? "Creating…" : "Create page"}</button>
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
    let data = null;
    try {
      const res = await fetch(`/api/community/wiki/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "suggest", content, reason })
      });
      data = await res.json();
    } catch {
      data = { ok: false, error: { message: "Network error — try again" } };
    }
    setBusy(false);
    if (!data?.ok) {
      setMsg(data?.error?.message || "Could not save — try again");
      return;
    }
    setContent("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3" aria-label="Suggest an improvement">
      <Field label={isAdmin ? "Edit content directly (admin)" : "Propose new content (goes to review)"}>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={5} maxLength={20000} placeholder="The corrected steps…" style={inputStyle} aria-label="Proposed content" />
      </Field>
      {!isAdmin && (
        <Field label="Why this change?"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Fixes the outdated install steps" style={inputStyle} aria-label="Reason" /></Field>
      )}
      {msg && <p className="text-xs" role="alert" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50" aria-busy={busy}>{busy ? "Saving…" : isAdmin ? "Apply edit" : "Submit for review"}</button>
    </form>
  );
}
