"use client";

import { useState } from "react";
import { Plus, Search, X, Mail, Linkedin, Archive, Users } from "lucide-react";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// The photo shown for a lead or head: the directory entry's own photo first,
// then the linked account's avatar. One of these is what the public pages read.
function photoOf(entry) {
  return entry.photo_url || entry.account_avatar || null;
}

function tenure(entry) {
  const start = entry.tenure_start ? String(entry.tenure_start).slice(0, 4) : null;
  const end = entry.tenure_end ? String(entry.tenure_end).slice(0, 4) : null;
  if (!start && !end) return null;
  if (entry.is_current) return `${start || "—"} → now`;
  return `${start || "—"} → ${end || "—"}`;
}

function PhotoField({ entry, onSave }) {
  const [value, setValue] = useState(entry.photo_url || "");
  const [busy, setBusy] = useState(false);
  const dirty = (entry.photo_url || "") !== value.trim();
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(entry, value.trim()); setBusy(false); }}
      className="mt-3 flex items-center gap-2"
    >
      <input
        type="url" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder="Photo URL (required for current leads)"
        aria-label={`Photo URL for ${entry.name}`}
        className="w-full rounded-lg border px-2 py-1 text-xs outline-none"
        style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
      />
      <button type="submit" disabled={busy || !dirty} className="shrink-0 text-xs underline disabled:opacity-40" style={{ color: "var(--accent)" }}>
        {busy ? "Saving…" : "Save photo"}
      </button>
    </form>
  );
}

export function LeadDirectory({ initialEntries = [], departments = [], canManage = false }) {
  const [entries, setEntries] = useState(initialEntries);
  const [departmentId, setDepartmentId] = useState("");
  const [vertical, setVertical] = useState("");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load(next = {}) {
    const dept = next.departmentId ?? departmentId;
    const vert = next.vertical ?? vertical;
    const only = next.currentOnly ?? currentOnly;
    const query = next.q ?? q;
    const p = new URLSearchParams();
    if (dept) p.set("department", dept);
    if (vert) p.set("vertical", vert);
    if (only) p.set("current", "1");
    if (query.trim()) p.set("q", query.trim());
    try {
      const res = await fetch(`/api/lead/directory?${p.toString()}`);
      const d = await res.json();
      if (d.ok) setEntries(d.data.entries ?? []);
      else setMsg(d.error?.message || "Could not load directory");
    } catch {
      setMsg("Network error — try again");
    }
  }

  async function create(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"), title: fd.get("title"),
      departmentId: fd.get("departmentId") || null,
      vertical: fd.get("vertical") || null,
      email: fd.get("email") || null,
      linkedinUrl: fd.get("linkedinUrl") || null,
      photoUrl: fd.get("photoUrl") || null,
      bio: fd.get("bio") || "",
      tenureStart: fd.get("tenureStart") || null,
      tenureEnd: fd.get("tenureEnd") || null,
      isCurrent: fd.get("isCurrent") === "on"
    };
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/lead/directory", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
      });
      const d = await res.json();
      if (d.ok) {
        form.reset();
        setShowForm(false);
        setMsg("Added ✓");
        load();
      } else {
        setMsg(d.error?.message || "Could not save");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(false);
  }

  async function archive(entry) {
    if (!window.confirm(`Remove ${entry.name} from the directory?`)) return;
    setMsg("Removing…");
    const res = await fetch(`/api/lead/directory/${entry.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) {
      setMsg("Removed ✓");
      setEntries((prev) => prev.filter((x) => x.id !== entry.id));
    } else {
      setMsg(d.error?.message || "Remove failed");
    }
  }

  async function toggleCurrent(entry) {
    const res = await fetch(`/api/lead/directory/${entry.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isCurrent: !entry.is_current })
    });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) {
      setMsg("Updated ✓");
      setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, is_current: !entry.is_current } : x)));
    } else {
      setMsg(d.error?.message || "Update failed");
    }
  }

  async function setPhoto(entry, photoUrl) {
    const res = await fetch(`/api/lead/directory/${entry.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoUrl: photoUrl || null })
    });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) {
      setMsg("Photo saved ✓");
      setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, photo_url: d.data.entry.photo_url } : x)));
    } else {
      setMsg(d.error?.message || "Could not save photo");
    }
  }

  const ok = msg.includes("✓");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); load({ departmentId: e.target.value }); }}
          aria-label="Filter by department" className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={vertical} onChange={(e) => { setVertical(e.target.value); load({ vertical: e.target.value }); }}
          aria-label="Filter by vertical" className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">All verticals</option>
          <option value="technical">Technical</option>
          <option value="non_technical">Non-technical</option>
        </select>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={currentOnly} onChange={(e) => { setCurrentOnly(e.target.checked); load({ currentOnly: e.target.checked }); }} />
          Current only
        </label>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative ml-auto max-w-xs flex-1">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or title…"
            className="w-full rounded-xl border py-2 pl-7 pr-3 text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
          />
        </form>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} className="btn-ink !py-2 inline-flex items-center gap-1.5 text-sm">
            {showForm ? <X size={14} /> : <Plus size={14} />} {showForm ? "Close" : "Add person"}
          </button>
        )}
      </div>

      {msg && (
        <p className="mb-4 inline-flex rounded-full border px-3 py-1 text-xs"
          style={ok
            ? { borderColor: "color-mix(in srgb, #16a34a 18%, transparent)", background: "color-mix(in srgb, #16a34a 10%, var(--bg))", color: "#16a34a" }
            : { borderColor: "color-mix(in srgb, var(--danger) 18%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, var(--bg))", color: "var(--danger)" }}>
          {msg}
        </p>
      )}

      {canManage && showForm && (
        <form onSubmit={create} className="mb-6 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <input name="name" required minLength={2} maxLength={120} placeholder="Full name" style={input} />
          <input name="title" required minLength={2} maxLength={80} placeholder="Title (e.g. Department Lead)" style={input} />
          <select name="departmentId" style={input} defaultValue="" aria-label="Department">
            <option value="">No department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select name="vertical" style={input} defaultValue="" aria-label="Vertical">
            <option value="">No vertical</option>
            <option value="technical">Technical</option>
            <option value="non_technical">Non-technical</option>
          </select>
          <input name="email" type="email" placeholder="Email (optional)" style={input} />
          <input name="linkedinUrl" type="url" placeholder="LinkedIn URL (optional)" style={input} />
          <input name="photoUrl" type="url" placeholder="Photo URL (required for current leads)" className="sm:col-span-2" style={input} />
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Tenure start<input name="tenureStart" type="date" style={input} /></label>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Tenure end (blank = current)<input name="tenureEnd" type="date" style={input} /></label>
          <textarea name="bio" rows={2} maxLength={600} placeholder="Short bio (optional)" className="sm:col-span-2" style={input} />
          <label className="flex items-center gap-2 text-xs sm:col-span-2" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" name="isCurrent" defaultChecked /> Currently holds this role
          </label>
          <button disabled={busy} className="btn-ink !py-2 justify-self-start text-sm disabled:opacity-50">{busy ? "Saving…" : "Add to directory"}</button>
        </form>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <Users size={18} className="mx-auto" style={{ color: "var(--text-muted)" }} />
          <p className="mt-3 text-sm font-medium" style={{ color: "var(--text)" }}>No one in the directory yet</p>
          <p className="narrative mx-auto mt-2 max-w-md">
            {canManage ? "Add the current leads and heads — and past holders who still help with handover." : "The leadership directory has not been filled in for this chapter."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div className="flex items-start gap-3">
                {photoOf(entry) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoOf(entry)}
                    alt={`${entry.name}, ${entry.title}`}
                    width={40}
                    height={40}
                    loading="lazy"
                    className="size-10 shrink-0 rounded-full border object-cover"
                    style={{ borderColor: "var(--line)" }}
                  />
                ) : (
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}>
                    {initials(entry.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{entry.name}</p>
                  <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{entry.title}</p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {[entry.department_name, entry.vertical === "non_technical" ? "Non-technical" : entry.vertical === "technical" ? "Technical" : null].filter(Boolean).join(" · ") || "Chapter-wide"}
                  </p>
                </div>
                {!entry.is_current && (
                  <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>past</span>
                )}
                {entry.is_current && !photoOf(entry) && (
                  <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, var(--line))", color: "var(--accent)" }}>photo needed</span>
                )}
              </div>
              {entry.bio && <p className="mt-3 line-clamp-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{entry.bio}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {tenure(entry) && <span style={{ color: "var(--text-muted)" }}>{tenure(entry)}</span>}
                {entry.email && <a href={`mailto:${entry.email}`} className="inline-flex items-center gap-1 underline" style={{ color: "var(--text-muted)" }}><Mail size={11} /> Email</a>}
                {entry.linkedin_url && <a href={entry.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: "var(--text-muted)" }}><Linkedin size={11} /> LinkedIn</a>}
              </div>
              {canManage && (
                <div className="mt-3 space-y-3">
                  <PhotoField entry={entry} onSave={setPhoto} />
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleCurrent(entry)} className="text-xs underline" style={{ color: "var(--text-muted)" }}>
                      {entry.is_current ? "Mark past" : "Mark current"}
                    </button>
                    <button onClick={() => archive(entry)} className="ml-auto inline-flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }}>
                      <Archive size={12} /> Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
