"use client";

import { useState } from "react";

function pill(status) {
  const map = { pending: "var(--text-muted)", needs_info: "#f59e0b", approved: "#16a34a", rejected: "var(--danger)", in_progress: "#2563eb", built: "#16a34a" };
  return map[status] || "var(--text-muted)";
}

export default function FeatureRequestList({ initial }) {
  const [items] = useState(initial || []);
  const [open, setOpen] = useState(null);
  if (items.length === 0) return <p className="narrative">No ideas yet — be the first to suggest.</p>;
  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{r.title}</p>
              <p className="meta mt-1">{r.category} · by {r.requester_name || r.requester_id.slice(0, 8)} · {new Date(r.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</p>
            </div>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold capitalize" style={{ borderColor: "var(--line)", background: "var(--bg)", color: pill(r.status) }}>{r.status.replace("_", " ")}</span>
          </div>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{r.description}</p>
          {(r.integration || r.tradeoffs || r.implementation) && (
            <button onClick={() => setOpen(open === r.id ? null : r.id)} className="mt-2 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>{open === r.id ? "Hide details ↑" : "How it integrates ↓"}</button>
          )}
          {open === r.id && (
            <div className="mt-3 grid gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              {r.integration && <div><p className="meta">Integration</p><p style={{ color: "var(--text)" }}>{r.integration}</p></div>}
              {r.tradeoffs && <div><p className="meta">Trade-offs</p><p style={{ color: "var(--text)" }}>{r.tradeoffs}</p></div>}
              {r.implementation && <div><p className="meta">Implementation</p><p style={{ color: "var(--text)" }}>{r.implementation}</p></div>}
              {r.decision_note && <div><p className="meta">Decision</p><p style={{ color: "var(--text)" }}>{r.decision_note}</p></div>}
              {r.assigned_to && <p className="meta">Assigned to {r.assigned_to.slice(0, 8)} · {r.status}</p>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
