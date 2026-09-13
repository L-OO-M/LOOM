"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = { width: "100%", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 };

export function NodeForm() {
  const router = useRouter();
  const [f, setF] = useState({ title: "", description: "", domain: "web", sortOrder: 0 });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/roadmaps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, sortOrder: Number(f.sortOrder) }) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setF({ title: "", description: "", domain: "web", sortOrder: 0 });
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Add / update node</p>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} placeholder="Node title" style={input} />
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} placeholder="Description" style={input} />
      <div className="grid grid-cols-2 gap-3">
        <input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="domain" style={input} />
        <input value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} type="number" placeholder="order" style={input} />
      </div>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink w-fit disabled:opacity-50">{busy ? "Saving…" : "Save node"}</button>
    </form>
  );
}

export function ResourceForm() {
  const router = useRouter();
  const [f, setF] = useState({ title: "", domain: "web", level: "foundation", kind: "article", url: "", minutes: 30 });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, minutes: Number(f.minutes), url: f.url || null }) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setF({ title: "", domain: "web", level: "foundation", kind: "article", url: "", minutes: 30 });
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Add / update resource</p>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} placeholder="Title" style={input} />
      <div className="grid grid-cols-3 gap-3">
        <input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="domain" style={input} />
        <input value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} placeholder="level" style={input} />
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} style={input}>
          <option value="article">article</option>
          <option value="doc">doc</option>
          <option value="video">video</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https:// (optional)" style={input} />
        <input value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} type="number" min={1} max={600} placeholder="minutes" style={input} />
      </div>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink w-fit disabled:opacity-50">{busy ? "Saving…" : "Save resource"}</button>
    </form>
  );
}

export function ContestForm() {
  const router = useRouter();
  const [f, setF] = useState({ title: "", description: "", status: "draft", startsAt: "", endsAt: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/contests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: f.title, description: f.description, status: f.status, startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null })
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setF({ title: "", description: "", status: "draft", startsAt: "", endsAt: "" });
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Create contest</p>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} placeholder="Title" style={input} />
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} placeholder="Description" style={input} />
      <div className="grid grid-cols-3 gap-3">
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} style={input}>
          <option value="draft">draft</option>
          <option value="published">published</option>
          <option value="active">active</option>
          <option value="open">open</option>
          <option value="closed">closed</option>
        </select>
        <input value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} type="datetime-local" style={input} />
        <input value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} type="datetime-local" style={input} />
      </div>
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink w-fit disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
    </form>
  );
}

export function MentorForm() {
  const router = useRouter();
  const [f, setF] = useState({ userId: "", expertise: "", bio: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/mentors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setF({ userId: "", expertise: "", bio: "" });
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Add mentor (promotes student → mentor)</p>
      <input value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} required placeholder="user_id (from Students list)" style={input} />
      <input value={f.expertise} onChange={(e) => setF({ ...f, expertise: e.target.value })} placeholder="Expertise, e.g. React, APIs" style={input} />
      <textarea value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} rows={2} placeholder="Bio" style={input} />
      {msg && <p className="text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
      <button disabled={busy} className="btn-ink w-fit disabled:opacity-50">{busy ? "Saving…" : "Save mentor"}</button>
    </form>
  );
}

export function FlagToggle({ flagKey, enabled }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch("/api/admin/flags", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: flagKey, enabled: !enabled }) });
    setBusy(false);
    router.refresh();
  }
  return (
    <button onClick={toggle} disabled={busy} className="rounded-md px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50"
      style={{ background: enabled ? "var(--text)" : "transparent", color: enabled ? "var(--bg)" : "var(--text-muted)", border: enabled ? "none" : "1px solid var(--line)" }}>
      {busy ? "…" : enabled ? "On" : "Off"}
    </button>
  );
}
