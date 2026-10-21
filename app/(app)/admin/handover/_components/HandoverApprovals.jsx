"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Meta } from "@/components/loom/primitives";

const ROLE_LABELS = {
  dept_lead: "Department Head",
  vertical_lead: "Vertical Lead",
  admin: "Super Admin"
};

const STATUS = {
  submitted: { label: "Waiting", color: "var(--warn)" },
  completed: { label: "Completed", color: "var(--success)" },
  rejected: { label: "Sent back", color: "var(--danger)" },
  cancelled: { label: "Cancelled", color: "var(--text-muted)" },
  draft: { label: "Draft", color: "var(--text-muted)" }
};

export function HandoverApprovals() {
  const [handovers, setHandovers] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/lead/handover?all=1", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.error?.message || "Could not load handovers.");
        return;
      }
      setError("");
      setHandovers(json.data.handovers || []);
    } catch {
      setError("Network error — try again.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(handover) {
    setBusy(handover.id);
    setNotice("");
    try {
      const res = await fetch(`/api/lead/handover/${handover.id}/transfer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: notes[handover.id] || "" })
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setNotice(json?.error?.message || "Could not approve the handover.");
      } else {
        setNotice(`Approved. ${handover.to_name || "The successor"} now holds the seat.`);
        await load();
      }
    } catch {
      setNotice("Network error — try again.");
    }
    setBusy("");
  }

  if (error) {
    return (
      <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <p className="narrative">{error}</p>
        <button onClick={load} className="btn-ghost mt-3 !py-1.5 !text-xs">Retry</button>
      </div>
    );
  }

  if (handovers === null) {
    return <div className="h-24 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)" }} />;
  }

  const waiting = handovers.filter((h) => h.status === "submitted");
  const recent = handovers.filter((h) => h.status !== "submitted").slice(0, 8);

  return (
    <div>
      {waiting.length === 0 ? (
        <p className="narrative">No handovers are waiting for approval. When a lead submits one, the brief appears here.</p>
      ) : (
        <ul className="space-y-3">
          {waiting.map((h) => (
            <li key={h.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {h.from_name || h.from_user_id}
                  <ArrowRight size={13} aria-hidden="true" />
                  {h.to_name || h.to_user_id}
                </p>
                <span className="meta">{ROLE_LABELS[h.role] || h.role}{h.department_name ? ` · ${h.department_name}` : ""}</span>
                <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-widest" style={{ borderColor: STATUS.submitted.color, color: STATUS.submitted.color }}>WAITING</span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium" style={{ color: "var(--accent)" }}>Read the brief</summary>
                <div className="mt-2 space-y-2 text-sm" style={{ color: "var(--text-muted)" }}>
                  <p><strong style={{ color: "var(--text)" }}>Owns:</strong> {h.brief?.summary || "Not written"}</p>
                  <p><strong style={{ color: "var(--text)" }}>In flight:</strong> {h.brief?.responsibilities || "Not written"}</p>
                  {h.brief?.activeWork && <p><strong style={{ color: "var(--text)" }}>Active work:</strong> {h.brief.activeWork}</p>}
                  {h.brief?.risks && <p><strong style={{ color: "var(--text)" }}>Risks:</strong> {h.brief.risks}</p>}
                  {h.brief?.contacts && <p><strong style={{ color: "var(--text)" }}>Contacts:</strong> {h.brief.contacts}</p>}
                  <p className="meta">Moves: {[h.transfer_planner && "planner", h.transfer_event_ops && "event ops", h.transfer_head_slot && "head slot"].filter(Boolean).join(", ") || "seat only"}</p>
                </div>
              </details>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[200px] flex-1">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Review note (optional)</span>
                  <input
                    value={notes[h.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [h.id]: e.target.value }))}
                    maxLength={1000}
                    style={{ width: "100%", marginTop: 4, borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 13 }}
                  />
                </label>
                <button onClick={() => approve(h)} disabled={busy === h.id} className="btn-ink !py-2 !text-xs disabled:opacity-50">
                  {busy === h.id ? <><Loader2 className="inline animate-spin" size={12} /> Transferring…</> : "Approve and transfer"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {notice && <p className="mt-3 text-xs" style={{ color: notice.startsWith("Approved") ? "var(--success)" : "var(--danger)" }}>{notice}</p>}

      {recent.length > 0 && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <Meta>Recent decisions</Meta>
          <ul className="mt-2 divide-y rounded-xl border" style={{ borderColor: "var(--line)" }}>
            {recent.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs">
                <span style={{ color: "var(--text)" }}>{h.from_name || h.from_user_id} → {h.to_name || h.to_user_id}</span>
                <span className="meta">{h.department_name || ROLE_LABELS[h.role] || h.role}</span>
                <span style={{ color: STATUS[h.status]?.color || "var(--text-muted)" }}>{STATUS[h.status]?.label || h.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
