"use client";

import { useEffect, useState } from "react";

async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json().catch(() => ({ ok: false }));
}

export function HandoverBoard() {
  const [items, setItems] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("docs");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api("/api/handover").catch(() => ({ ok: false }));
    if (data?.ok) setItems(data.data.items || []);
  }
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (title.trim().length < 3) return;
    setBusy(true);
    const data = await api("/api/handover", "POST", { title: title.trim(), category }).catch(() => ({ ok: false }));
    setBusy(false);
    if (data?.ok) {
      setTitle("");
      load();
    }
  }

  async function toggle(item) {
    const data = await api(`/api/handover/${item.id}`, "PATCH", { done: !item.done }).catch(() => ({ ok: false }));
    if (data?.ok) load();
  }

  if (items === null) {
    return <div className="h-24 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)" }} />;
  }
  const done = items.filter((i) => i.done).length;
  return (
    <div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full" role="img" aria-label={`Handover ${done} of ${items.length} complete`} style={{ background: "var(--line)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: items.length ? `${Math.round((done / items.length) * 100)}%` : "0%", background: "linear-gradient(to right, var(--thread-cyan), var(--thread-gold))" }} />
      </div>
      <p className="meta mb-4">{done} of {items.length} transferred</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => toggle(item)}
              aria-pressed={item.done}
              className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition hover:-translate-y-px"
              style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", opacity: item.done ? 0.6 : 1 }}
            >
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold"
                style={item.done ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#101314" } : { borderColor: "var(--line)", color: "transparent" }}>
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" style={{ color: "var(--text)", textDecoration: item.done ? "line-through" : "none" }}>{item.title}</span>
                <span className="meta">{item.category || "general"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="narrative mt-2">Empty checklist. Seed it below with everything the next committee must receive.</p>
      )}
      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} placeholder="e.g. Sponsor contact sheet" aria-label="New item" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, flex: "1 1 200px" }} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 }}>
          <option value="docs">Docs</option>
          <option value="credentials">Credentials list</option>
          <option value="contacts">Contacts</option>
          <option value="projects">Ongoing projects</option>
          <option value="general">General</option>
        </select>
        <button disabled={busy} className="btn-ink !py-2 text-sm disabled:opacity-50">{busy ? "Adding…" : "Add item"}</button>
      </form>
    </div>
  );
}
