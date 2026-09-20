"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["pending", "needs_info", "approved", "rejected", "in_progress", "built"];

export default function AdminFeatureBoard({ initial }) {
  const [items, setItems] = useState(initial);
  const [note, setNote] = useState({});
  const router = useRouter();

  async function act(id, patch) {
    const res = await fetch(`/api/feature-requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    const data = await res.json();
    if (data.ok) {
      setItems((prev) => prev.map((r) => (r.id === id ? data.data.request : r)));
      router.refresh();
    }
  }

  async function comment(id) {
    const body = note[id]?.trim();
    if (!body) return;
    const res = await fetch(`/api/feature-requests/${id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
    if ((await res.json()).ok) { setNote({ ...note, [id]: "" }); alert("Question posted — requester notified"); }
  }

  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{r.title} <span className="meta ml-2">{r.category}</span></p>
              <p className="meta">by {r.requester_name || r.requester_id.slice(0, 8)} · {new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            <span className="rounded-full border px-2 py-1 text-xs capitalize" style={{ borderColor: "var(--line)", color: "var(--text)" }}>{r.status}</span>
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{r.description}</p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--accent)" }}>Integration / trade-offs / implementation</summary>
            <div className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {r.integration && <p><strong style={{ color: "var(--text)" }}>Integration:</strong> {r.integration}</p>}
              {r.tradeoffs && <p><strong style={{ color: "var(--text)" }}>Trade-offs:</strong> {r.tradeoffs}</p>}
              {r.implementation && <p><strong style={{ color: "var(--text)" }}>Implementation:</strong> {r.implementation}</p>}
            </div>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => act(r.id, { status: s })} className="rounded-full border px-3 py-1 text-xs font-semibold capitalize" style={{ borderColor: r.status === s ? "var(--accent)" : "var(--line)", background: r.status === s ? "var(--accent)" : "transparent", color: r.status === s ? "#101314" : "var(--text-muted)" }}>{s.replace("_", " ")}</button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={note[r.id] || ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} placeholder="Counter-question or decision note" className="flex-1 min-w-[200px] rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg)" }} />
            <button onClick={() => comment(r.id)} className="rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)" }}>Ask</button>
            <button onClick={() => act(r.id, { assigned_to: r.requester_id, status: "in_progress", decision_note: note[r.id] || "Assigned to you — start building" })} className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold" style={{ color: "#101314" }}>Let them build →</button>
          </div>
        </li>
      ))}
      {items.length === 0 && <p className="narrative">No ideas yet.</p>}
    </ul>
  );
}
