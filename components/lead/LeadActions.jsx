"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function postJSON(url, method, body) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json().catch(() => ({ ok: false }));
}

function useAction(fn) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run(...args) {
    setBusy(true);
    setMsg("");
    try {
      const data = await fn(...args);
      if (data?.ok) {
        setMsg("Done ✓");
        router.refresh();
      } else {
        setMsg(data?.error?.message || "Failed");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(false);
  }
  return { busy, msg, run };
}

export function GrantCoreButton({ departmentId, userId, name }) {
  const { busy, msg, run } = useAction(() =>
    postJSON(`/api/departments/${departmentId}/members/${userId}`, "PATCH", { level: "core" }));
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={() => run()} disabled={busy} className="btn-ink !py-1 !text-xs disabled:opacity-50">
        {busy ? "Granting…" : `Grant Core · ${name.split(" ")[0]}`}
      </button>
      {msg && <span className="text-xs" style={{ color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function SuccessionToggle({ departmentId, userId, name, ready }) {
  const { busy, msg, run } = useAction(() =>
    postJSON("/api/lead/succession", "PATCH", { userId, departmentId, ready: !ready }));
  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => run()} disabled={busy}
        aria-pressed={ready}
        className="rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-50"
        style={ready
          ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314" }
          : { borderColor: "var(--line)", color: "var(--text-muted)" }}
      >
        {ready ? `✓ succession-ready · ${name.split(" ")[0]}` : `Mark succession-ready`}
      </button>
      {msg && !msg.includes("✓") && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function ApproveEventButton({ id, approve, label }) {
  const { busy, msg, run } = useAction(() => postJSON(`/api/events/${id}/approve`, "POST", { approve }));
  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => run()} disabled={busy}
        className={approve ? "btn-ink !py-1 !text-xs disabled:opacity-50" : "btn-ghost !py-1 !text-xs disabled:opacity-50"}
      >
        {busy ? "…" : label}
      </button>
      {msg && !msg.includes("✓") && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function WorkshopForm({ departments }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [societyWide, setSocietyWide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!departments.length) return null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/events", "POST", {
      title, startsAt: new Date(startsAt).toISOString(),
      scope: societyWide ? "society" : "department", departmentId: societyWide ? null : departmentId
    });
    setBusy(false);
    if (data?.ok) {
      setTitle("");
      setStartsAt("");
      setMsg(data.data.event.status === "proposed" ? "Sent for approval ✓" : "Published ✓");
      router.refresh();
    } else {
      setMsg(data?.error?.message || "Failed");
    }
  }
  const input = { borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, width: "100%" };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <strong className="text-sm" style={{ color: "var(--text)" }}>Schedule a workshop</strong>
      <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} placeholder="Workshop title" style={input} aria-label="Workshop title" />
      <div className="grid grid-cols-2 gap-3">
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required style={input} aria-label="Starts at" />
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={societyWide} style={input} aria-label="Department">
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <input type="checkbox" checked={societyWide} onChange={(e) => setSocietyWide(e.target.checked)} />
        Society-wide (needs Vertical Lead approval — goes to the queue)
      </label>
      <div className="flex items-center gap-3">
        <button disabled={busy} className="btn-ink !py-2 text-sm disabled:opacity-50">{busy ? "Posting…" : societyWide ? "Send for approval" : "Publish workshop"}</button>
        {msg && <span className="text-xs" style={{ color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>{msg}</span>}
      </div>
    </form>
  );
}
