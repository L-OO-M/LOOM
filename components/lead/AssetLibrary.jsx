"use client";

import { useState } from "react";
import { Plus, Search, Upload, Link2, Download, Archive, FileText, ExternalLink, X } from "lucide-react";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

const KIND_LABELS = {
  logo: "Logo", signature: "Signature", template: "Template", document: "Document",
  image: "Image", link: "Link", other: "Other"
};

function formatSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return "link";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition"
      style={active
        ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314" }
        : { borderColor: "var(--line)", color: "var(--text-muted)" }}
    >
      <Icon size={12} /> {children}
    </button>
  );
}

async function postForm(url, formData) {
  const res = await fetch(url, { method: "POST", body: formData });
  return res.json().catch(() => ({ ok: false }));
}

export function AssetLibrary({ initialAssets = [], categories = [], canManage = false }) {
  const [assets, setAssets] = useState(initialAssets);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [kind, setKind] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState("file");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [failed, setFailed] = useState(false);

  async function load(nextCategory = categoryId, nextKind = kind, nextQ = q) {
    const p = new URLSearchParams();
    if (nextCategory) p.set("category", nextCategory);
    if (nextKind) p.set("kind", nextKind);
    if (nextQ.trim()) p.set("q", nextQ.trim());
    try {
      const res = await fetch(`/api/lead/assets?${p.toString()}`);
      const d = await res.json();
      if (d.ok) {
        setAssets(d.data.assets ?? []);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  }

  function onSearch(e) {
    e.preventDefault();
    load();
  }

  function onFilter(nextCategory, nextKind) {
    setCategoryId(nextCategory);
    setKind(nextKind);
    load(nextCategory, nextKind);
  }

  async function submitFile(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!fd.get("file") || !fd.get("file").name) {
      setMsg("Choose a file first");
      return;
    }
    setBusy(true);
    setMsg("");
    const d = await postForm("/api/lead/assets", fd);
    setBusy(false);
    if (d.ok) {
      form.reset();
      setShowForm(false);
      setMsg("Uploaded ✓");
      load();
    } else {
      setMsg(d.error?.message || "Upload failed");
    }
  }

  async function submitLink(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMsg("");
    const d = await postForm("/api/lead/assets", fd);
    setBusy(false);
    if (d.ok) {
      form.reset();
      setShowForm(false);
      setMsg("Saved ✓");
      load();
    } else {
      setMsg(d.error?.message || "Could not save link");
    }
  }

  function uploadVersion(asset) {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      setMsg("Uploading…");
      const d = await postForm(`/api/lead/assets/${asset.id}/versions`, fd);
      if (d.ok) {
        setMsg("New version saved ✓");
        load();
      } else {
        setMsg(d.error?.message || "Version upload failed");
      }
    };
    picker.click();
  }

  async function archive(asset) {
    if (!window.confirm(`Archive “${asset.title}”? It leaves the library; versions stay recoverable.`)) return;
    setMsg("Archiving…");
    const res = await fetch(`/api/lead/assets/${asset.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) {
      setMsg("Archived ✓");
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } else {
      setMsg(d.error?.message || "Archive failed");
    }
  }

  const ok = msg.includes("✓");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={categoryId}
          onChange={(e) => onFilter(e.target.value, kind)}
          aria-label="Filter by category"
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={kind}
          onChange={(e) => onFilter(categoryId, e.target.value)}
          aria-label="Filter by kind"
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">All kinds</option>
          {Object.entries(KIND_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <form onSubmit={onSearch} className="relative ml-auto max-w-xs flex-1">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or description…"
            className="w-full rounded-xl border py-2 pl-7 pr-3 text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
          />
        </form>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} className="btn-ink !py-2 inline-flex items-center gap-1.5 text-sm">
            {showForm ? <X size={14} /> : <Plus size={14} />} {showForm ? "Close" : "Add asset"}
          </button>
        )}
      </div>

      {msg && (
        <p
          className="mb-4 inline-flex rounded-full border px-3 py-1 text-xs"
          style={ok
            ? { borderColor: "color-mix(in srgb, #16a34a 18%, transparent)", background: "color-mix(in srgb, #16a34a 10%, var(--bg))", color: "#16a34a" }
            : { borderColor: "color-mix(in srgb, var(--danger) 18%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, var(--bg))", color: "var(--danger)" }}
        >
          {msg}
        </p>
      )}
      {failed && (
        <p className="mb-4 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "color-mix(in srgb, var(--danger) 22%, transparent)", color: "var(--danger)" }}>
          Could not load assets — check your connection and retry.
        </p>
      )}

      {canManage && showForm && (
        <div className="mb-6 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="mb-4 flex items-center gap-2">
            <TabButton active={mode === "file"} onClick={() => setMode("file")} icon={Upload}>Upload a file</TabButton>
            <TabButton active={mode === "link"} onClick={() => setMode("link")} icon={Link2}>Link out</TabButton>
          </div>
          {mode === "file" ? (
            <form onSubmit={submitFile} className="grid gap-3">
              <input name="title" required minLength={2} maxLength={160} placeholder="Title (e.g. Chapter logo 2026)" style={input} />
              <textarea name="description" rows={2} maxLength={600} placeholder="Description (optional)" style={input} />
              <div className="grid grid-cols-2 gap-3">
                <select name="categoryId" style={input} defaultValue="" aria-label="Category">
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select name="kind" style={input} defaultValue="document" aria-label="Kind">
                  {Object.entries(KIND_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <input name="tags" placeholder="Tags, comma separated (optional)" style={input} />
              <input name="file" type="file" required style={input} aria-label="File" />
              <button disabled={busy} className="btn-ink !py-2 justify-self-start text-sm disabled:opacity-50">{busy ? "Uploading…" : "Upload"}</button>
              <p className="meta">Up to 25 MB. Images, PDF, Office docs, zip. Nothing is public — links are short-lived.</p>
            </form>
          ) : (
            <form onSubmit={submitLink} className="grid gap-3">
              <input name="title" required minLength={2} maxLength={160} placeholder="Title (e.g. Brand kit on Drive)" style={input} />
              <input name="externalUrl" type="url" required placeholder="https://…" style={input} />
              <textarea name="description" rows={2} maxLength={600} placeholder="Description (optional)" style={input} />
              <div className="grid grid-cols-2 gap-3">
                <select name="categoryId" style={input} defaultValue="" aria-label="Category">
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select name="kind" style={input} defaultValue="link" aria-label="Kind">
                  {Object.entries(KIND_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <input name="tags" placeholder="Tags, comma separated (optional)" style={input} />
              <button disabled={busy} className="btn-ink !py-2 justify-self-start text-sm disabled:opacity-50">{busy ? "Saving…" : "Save link"}</button>
            </form>
          )}
        </div>
      )}

      {assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No assets in the library yet</p>
          <p className="narrative mx-auto mt-2 max-w-md">
            {canManage ? "Upload the chapter's logos, templates and signatures — or link out to a repo or drive." : "Nothing has been added for this chapter yet."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => (
            <li key={a.id} className="flex flex-col justify-between rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                    <FileText size={14} />
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                    {a.category_name || KIND_LABELS[a.kind] || a.kind}
                  </span>
                </div>
                <p className="mt-3 truncate text-sm font-medium" style={{ color: "var(--text)" }}>{a.title}</p>
                {a.description && <p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{a.description}</p>}
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {KIND_LABELS[a.kind] || a.kind} · {formatSize(a.size_bytes)}
                  {a.storage_path ? ` · v${a.current_version}` : ""}
                  {a.created_by_name ? ` · ${a.created_by_name.split(" ")[0]}` : ""}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {a.external_url ? (
                  <a href={a.external_url} target="_blank" rel="noreferrer" className="btn-ghost !py-1 inline-flex items-center gap-1 text-xs">
                    <ExternalLink size={12} /> Open
                  </a>
                ) : (
                  <a href={`/api/lead/assets/${a.id}/download`} className="btn-ghost !py-1 inline-flex items-center gap-1 text-xs">
                    <Download size={12} /> Download
                  </a>
                )}
                {canManage && a.storage_path && (
                  <button onClick={() => uploadVersion(a)} className="text-xs underline" style={{ color: "var(--text-muted)" }}>New version</button>
                )}
                {canManage && (
                  <button onClick={() => archive(a)} className="ml-auto inline-flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }}>
                    <Archive size={12} /> Archive
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
