"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Drawer } from "./loom/Drawer";

export function FeatureRequestFab() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", integration: "", tradeoffs: "", implementation: "", category: "general" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/feature-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.ok) { setMsg(data.error?.message || "Failed"); setBusy(false); return; }
      setForm({ title: "", description: "", integration: "", tradeoffs: "", implementation: "", category: "general" });
      setMsg("Submitted ✓ — admins will review and may assign you to build it");
      setTimeout(() => setOpen(false), 1200);
    } catch { setMsg("Network error"); }
    setBusy(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-2xl border-y border-l px-3 py-4 text-xs font-bold tracking-widest shadow-lg"
        style={{ background: "var(--accent)", color: "#101314", borderColor: "var(--accent)", writingMode: "vertical-rl", textOrientation: "mixed" }}
        aria-label="Suggest a feature"
      >
        <span className="flex items-center gap-2"><Lightbulb size={14} /> Suggest feature</span>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} label="Suggest what's missing">
        <p className="narrative">Tell us what’s missing — what it is, how it should integrate, trade-offs, and how you’d build it. Admins can approve, ask, or let you build it.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm font-medium" style={{ color: "var(--text)" }}>Title *<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={4} maxLength={160} placeholder="e.g. Dark mode for code snippets" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }} /></label>
          <label className="block text-sm font-medium" style={{ color: "var(--text)" }}>What’s missing & why *<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={10} maxLength={2000} rows={3} placeholder="Describe the gap and who it helps" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }} /></label>
          <label className="block text-sm" style={{ color: "var(--text-muted)" }}>How should it integrate?<textarea value={form.integration} onChange={(e) => setForm({ ...form, integration: e.target.value })} maxLength={2000} rows={2} placeholder="Where in nav/page, which data, which roles" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }} /></label>
          <label className="block text-sm" style={{ color: "var(--text-muted)" }}>Potential trade-offs<textarea value={form.tradeoffs} onChange={(e) => setForm({ ...form, tradeoffs: e.target.value })} maxLength={2000} rows={2} placeholder="Costs, complexity, alternatives" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }} /></label>
          <label className="block text-sm" style={{ color: "var(--text-muted)" }}>How you’d implement<textarea value={form.implementation} onChange={(e) => setForm({ ...form, implementation: e.target.value })} maxLength={2000} rows={2} placeholder="Tech, tables, APIs, components" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }} /></label>
          <label className="block text-sm" style={{ color: "var(--text-muted)" }}>Category
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <option value="general">general</option><option value="ui">ui</option><option value="performance">performance</option><option value="content">content</option><option value="integration">integration</option><option value="other">other</option>
            </select>
          </label>
          <button disabled={busy} className="btn-ink w-full disabled:opacity-50">{busy ? "Submitting…" : "Submit idea"}</button>
          {msg && <p className="text-xs" style={{ color: msg.includes("✓") ? "var(--success)" : "var(--danger)" }}>{msg}</p>}
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Track yours at <a href="/student/feature-requests" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>/student/feature-requests</a></p>
        </form>
      </Drawer>
    </>
  );
}
