"use client";

import { useState } from "react";
import { Plus, Search, X, FileText, Download, Upload, Archive, AlertTriangle } from "lucide-react";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

const PARTNER_TYPES = ["sponsor", "company", "college", "community", "government", "other"];
const STATUSES = ["draft", "sent", "active", "expired", "terminated"];

const STATUS_STYLE = {
  active: { color: "#16a34a", bg: "color-mix(in srgb, #16a34a 12%, var(--bg))" },
  sent: { color: "#d97706", bg: "color-mix(in srgb, #d97706 12%, var(--bg))" },
  expired: { color: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 12%, var(--bg))" },
  terminated: { color: "var(--text-muted)", bg: "var(--bg)" },
  draft: { color: "var(--text-muted)", bg: "var(--bg)" }
};

function money(amount, currency) {
  if (amount === null || amount === undefined) return null;
  return `${currency || ""} ${Number(amount).toLocaleString()}`.trim();
}

function daysLeft(endsOn) {
  if (!endsOn) return null;
  const days = Math.ceil((new Date(endsOn).getTime() - Date.now()) / 86400000);
  return days;
}

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

export function MouBoard({ initialMous = [], canManage = false }) {
  const [mous, setMous] = useState(initialMous);
  const [status, setStatus] = useState("");
  const [expiring, setExpiring] = useState(false);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);

  async function load(next = {}) {
    const s = next.status ?? status;
    const e = next.expiring ?? expiring;
    const query = next.q ?? q;
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (e) p.set("expiring", "1");
    if (query.trim()) p.set("q", query.trim());
    try {
      const res = await fetch(`/api/lead/mous?${p.toString()}`);
      const d = await res.json();
      if (d.ok) setMous(d.data.mous ?? []);
      else setMsg(d.error?.message || "Could not load MoUs");
    } catch {
      setMsg("Network error — try again");
    }
  }

  async function openDetail(id) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    try {
      const res = await fetch(`/api/lead/mous/${id}`);
      const d = await res.json();
      setDetail(d.ok ? d.data.mou : null);
    } catch {
      setDetail(null);
    }
  }

  async function create(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      title: fd.get("title"), partnerName: fd.get("partnerName"),
      partnerType: fd.get("partnerType"), status: fd.get("status"),
      vertical: fd.get("vertical") || null,
      valueAmount: fd.get("valueAmount") ? Number(fd.get("valueAmount")) : null,
      valueCurrency: fd.get("valueCurrency") || "INR",
      signedOn: fd.get("signedOn") || null, startsOn: fd.get("startsOn") || null, endsOn: fd.get("endsOn") || null,
      summary: fd.get("summary") || ""
    };
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/lead/mous", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
      });
      const d = await res.json();
      if (d.ok) {
        form.reset();
        setShowForm(false);
        setMsg("MoU recorded ✓");
        load();
      } else {
        setMsg(d.error?.message || "Could not save");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(false);
  }

  async function setStatusFor(mou, nextStatus) {
    setMsg("Saving…");
    const res = await fetch(`/api/lead/mous/${mou.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextStatus })
    });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) {
      setMsg("Updated ✓");
      setMous((prev) => prev.map((m) => (m.id === mou.id ? { ...m, status: nextStatus } : m)));
      if (detail?.id === mou.id) setDetail({ ...detail, status: nextStatus });
    } else {
      setMsg(d.error?.message || "Update failed");
    }
  }

  async function uploadDocument(mou) {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const label = window.prompt("Document label (versions group by label)", "Agreement");
      if (label === null) return;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", label || "Agreement");
      setMsg("Uploading…");
      const res = await fetch(`/api/lead/mous/${mou.id}/documents`, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({ ok: false }));
      if (d.ok) {
        setMsg("Document added ✓");
        const fresh = await fetch(`/api/lead/mous/${mou.id}`).then((r) => r.json()).catch(() => null);
        if (fresh?.ok) setDetail(fresh.data.mou);
        load();
      } else {
        setMsg(d.error?.message || "Upload failed");
      }
    };
    picker.click();
  }

  async function archive(mou) {
    if (!window.confirm(`Archive the MoU with ${mou.partner_name}? Documents stay recoverable.`)) return;
    setMsg("Archiving…");
    const res = await fetch(`/api/lead/mous/${mou.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) {
      setMsg("Archived ✓");
      setMous((prev) => prev.filter((m) => m.id !== mou.id));
      if (openId === mou.id) { setOpenId(null); setDetail(null); }
    } else {
      setMsg(d.error?.message || "Archive failed");
    }
  }

  const ok = msg.includes("✓");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={status} onChange={(e) => { setStatus(e.target.value); load({ status: e.target.value }); }}
          aria-label="Filter by status" className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={expiring} onChange={(e) => { setExpiring(e.target.checked); load({ expiring: e.target.checked }); }} />
          Ending soon
        </label>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative ml-auto max-w-xs flex-1">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or partner…"
            className="w-full rounded-xl border py-2 pl-7 pr-3 text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
          />
        </form>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} className="btn-ink !py-2 inline-flex items-center gap-1.5 text-sm">
            {showForm ? <X size={14} /> : <Plus size={14} />} {showForm ? "Close" : "Record MoU"}
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
          <input name="title" required minLength={2} maxLength={160} placeholder="Title (e.g. Cloud credits for hackathons)" style={input} />
          <input name="partnerName" required minLength={2} maxLength={120} placeholder="Partner organisation" style={input} />
          <select name="partnerType" style={input} defaultValue="sponsor" aria-label="Partner type">
            {PARTNER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select name="status" style={input} defaultValue="draft" aria-label="Status">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="vertical" style={input} defaultValue="" aria-label="Scope">
            <option value="">Society-wide</option>
            <option value="technical">Technical</option>
            <option value="non_technical">Non-technical</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input name="valueAmount" type="number" min={0} step="0.01" placeholder="Value" style={input} />
            <input name="valueCurrency" maxLength={8} placeholder="INR" style={input} />
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Signed<input name="signedOn" type="date" style={input} /></label>
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Starts<input name="startsOn" type="date" style={input} /></label>
            <label className="text-xs" style={{ color: "var(--text-muted)" }}>Ends<input name="endsOn" type="date" style={input} /></label>
          </div>
          <textarea name="summary" rows={2} maxLength={2000} placeholder="One-line summary" className="sm:col-span-2" style={input} />
          <button disabled={busy} className="btn-ink !py-2 justify-self-start text-sm disabled:opacity-50">{busy ? "Saving…" : "Save MoU"}</button>
        </form>
      )}

      {mous.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No MoUs recorded yet</p>
          <p className="narrative mx-auto mt-2 max-w-md">
            {canManage ? "Record the first agreement — who it's with, when it ends, and the signed copy." : "Nothing has been recorded for this chapter yet."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {mous.map((m) => {
            const left = daysLeft(m.ends_on);
            const soon = m.status === "active" && left !== null && left <= 30;
            const isOpen = openId === m.id;
            return (
              <li key={m.id} className="rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <button onClick={() => openDetail(m.id)} className="flex w-full items-start gap-3 p-4 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{m.title}</span>
                      <StatusPill status={m.status} />
                      {soon && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: "color-mix(in srgb, var(--danger) 12%, var(--bg))", color: "var(--danger)" }}>
                          <AlertTriangle size={10} /> {left <= 0 ? "lapsed" : `${left}d left`}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-xs" style={{ color: "var(--text-muted)" }}>
                      {m.partner_name} · {m.partner_type} · {m.vertical || "society-wide"}
                      {money(m.value_amount, m.value_currency) ? ` · ${money(m.value_amount, m.value_currency)}` : ""}
                      {m.ends_on ? ` · ends ${String(m.ends_on).slice(0, 10)}` : ""}
                      {` · ${m.document_count} doc${m.document_count === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
                    {detail === null ? (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading…</p>
                    ) : (
                      <>
                        {detail.summary && <p className="narrative text-sm">{detail.summary}</p>}
                        <div className="mt-3 space-y-1.5">
                          {detail.documents?.length ? detail.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                              <FileText size={12} />
                              <span style={{ color: "var(--text)" }}>{doc.label}</span>
                              <span>v{doc.version}</span>
                              <a href={`/api/lead/mous/${m.id}/documents/${doc.id}/download`} className="inline-flex items-center gap-1 underline">
                                <Download size={11} /> {doc.file_name}
                              </a>
                            </div>
                          )) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>No signed copy attached yet.</p>}
                        </div>
                        {canManage && (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button onClick={() => uploadDocument(m)} className="btn-ghost !py-1 inline-flex items-center gap-1 text-xs">
                              <Upload size={12} /> Add document
                            </button>
                            {detail.status !== "active" && (
                              <button onClick={() => setStatusFor(m, "active")} className="text-xs underline" style={{ color: "#16a34a" }}>Mark active</button>
                            )}
                            {detail.status !== "terminated" && (
                              <button onClick={() => setStatusFor(m, "terminated")} className="text-xs underline" style={{ color: "var(--text-muted)" }}>Terminate</button>
                            )}
                            <button onClick={() => archive(m)} className="ml-auto inline-flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }}>
                              <Archive size={12} /> Archive
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
