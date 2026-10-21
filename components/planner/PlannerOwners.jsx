"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, ShieldCheck } from "lucide-react";

const selectStyle = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--bg)",
  color: "var(--text)",
  padding: "8px 10px",
  fontSize: 13,
};

/**
 * Who owns the planner — and how it moves to the next person.
 *
 * The calendar is shared by everyone at lead level and above. When a holder
 * steps down, an admin or vertical lead moves every row they owned to a
 * successor in one action (`PATCH /api/planner`), so a handover never means
 * re-typing the plan. Read-only for the tiers that cannot reassign.
 */
export function PlannerOwners({ owners = [], assignable = [], canManage = false }) {
  const router = useRouter();
  const [fromUserId, setFromUserId] = useState(owners[0]?.user_id ?? "unassigned");
  const [toUserId, setToUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const owned = owners.filter((o) => o.user_id);
  const unassigned = owners.find((o) => !o.user_id)?.sessions ?? 0;
  const fromLabel = fromUserId === "unassigned" ? "Unassigned" : owned.find((o) => o.user_id === fromUserId)?.name || "—";
  const fromCount = fromUserId === "unassigned" ? unassigned : owned.find((o) => o.user_id === fromUserId)?.sessions ?? 0;

  async function transfer(e) {
    e.preventDefault();
    if (!toUserId) {
      setMsg("Pick the person taking over.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/planner", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reassign",
          fromUserId: fromUserId === "unassigned" ? null : fromUserId,
          toUserId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Could not reassign");
        return;
      }
      setMsg(`${data.data.reassigned} session${data.data.reassigned === 1 ? "" : "s"} moved to the successor.`);
      router.refresh();
    } catch {
      setMsg("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <p className="meta flex items-center gap-1.5"><ShieldCheck size={12} /> Planner ownership</p>
      <p className="narrative mt-1 text-xs">
        Every session has one accountable member. Move a departing holder&rsquo;s rows to the next person in one step.
      </p>

      {owners.length === 0 ? (
        <p className="narrative mt-3 text-xs">No sessions assigned yet.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {owners.map((o) => (
            <li key={o.user_id || "unassigned"} className="flex items-center justify-between gap-3 text-xs" style={{ color: "var(--text)" }}>
              <span className="min-w-0 truncate">
                {o.name || "Unassigned"}
                {o.role ? <span style={{ color: "var(--text-muted)" }}> · {o.role}</span> : null}
              </span>
              <span className="shrink-0 font-mono" style={{ color: "var(--text-muted)" }}>{o.sessions}</span>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={transfer} className="mt-4 space-y-3">
          <label className="block">
            <span className="meta">Handing over from</span>
            <select value={fromUserId} onChange={(e) => setFromUserId(e.target.value)} style={{ ...selectStyle, marginTop: 4 }}>
              <option value="unassigned">Unassigned ({unassigned})</option>
              {owned.map((o) => (
                <option key={o.user_id} value={o.user_id}>{o.name || o.user_id} ({o.sessions})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="meta">Passing to</span>
            <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} style={{ ...selectStyle, marginTop: 4 }}>
              <option value="">Choose the successor…</option>
              {assignable.map((p) => (
                <option key={p.user_id} value={p.user_id}>{p.name || p.user_id} · {p.role}</option>
              ))}
            </select>
          </label>
          <button disabled={busy || !toUserId || fromCount === 0} className="btn-ink !py-2 inline-flex items-center gap-1.5 text-sm disabled:opacity-50">
            <ArrowRightLeft size={13} /> {busy ? "Transferring…" : `Transfer ${fromCount} from ${fromLabel}`}
          </button>
          {msg ? (
            <p className="text-xs" style={{ color: msg.includes("moved") ? "var(--text-muted)" : "var(--danger)" }}>{msg}</p>
          ) : null}
        </form>
      ) : (
        <p className="meta mt-4 text-[11px]">Only an admin or vertical lead can reassign sessions.</p>
      )}
    </div>
  );
}
