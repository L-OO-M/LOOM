"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, ArrowUp, ArrowDown, UserMinus, ShieldAlert } from "lucide-react";
import { DeclineCoreButton } from "@/components/lead/LeadActions";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

const btn = {
  borderRadius: 10, border: "1px solid var(--line)", padding: "6px 10px",
  fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--bg-elevated)",
  display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer"
};

const LEVEL_LABEL = { dept_lead: "Head / Co-head", core: "Core", general: "General" };

/**
 * Roster controls for one department. A head may add, promote, demote and
 * remove within their own department; a Head's own seat is an appointment and
 * is shown as read-only here. Removal only drops the seat — work already
 * recorded keeps the person's name on it.
 */
export function DepartmentRoster({
  departmentId,
  departmentName,
  initialMembers = [],
  candidates = [],
  canManage = false,
  meId = null
}) {
  const [members, setMembers] = useState(initialMembers);
  const [pool, setPool] = useState(candidates);
  const [pick, setPick] = useState("");
  const [level, setLevel] = useState("general");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function add(e) {
    e.preventDefault();
    if (!pick) return;
    setBusy("add");
    setMsg("");
    try {
      const res = await fetch(`/api/departments/${departmentId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: pick, level })
      });
      const d = await res.json().catch(() => ({ ok: false }));
      if (d.ok) {
        const person = pool.find((p) => p.user_id === pick);
        setMembers((prev) => [
          ...prev.filter((m) => m.user_id !== pick),
          { user_id: pick, name: person?.name, level: d.data.membership.level, core_requested: false }
        ]);
        setPool((prev) => prev.filter((p) => p.user_id !== pick));
        setPick("");
        setMsg("Added ✓");
      } else {
        setMsg(d.error?.message || "Could not add that person");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy("");
  }

  async function setMemberLevel(member, next) {
    setBusy(member.user_id);
    setMsg("");
    try {
      const res = await fetch(`/api/departments/${departmentId}/members/${member.user_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: next })
      });
      const d = await res.json().catch(() => ({ ok: false }));
      if (d.ok) {
        setMembers((prev) => prev.map((m) => (
          m.user_id === member.user_id ? { ...m, level: d.data.membership.level, core_requested: false } : m
        )));
        setMsg(next === "core" ? "Promoted to Core ✓" : "Moved to General ✓");
      } else {
        setMsg(d.error?.message || "Could not change that role");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy("");
  }

  async function remove(member) {
    if (!window.confirm(`Remove ${member.name || "this member"} from ${departmentName}? Their recorded work stays.`)) {
      return;
    }
    setBusy(member.user_id);
    setMsg("");
    try {
      const res = await fetch(`/api/departments/${departmentId}/members/${member.user_id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({ ok: false }));
      if (d.ok) {
        setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
        setPool((prev) => [...prev, { user_id: member.user_id, name: member.name }]);
        setMsg("Removed from the department ✓");
      } else {
        setMsg(d.error?.message || "Could not remove that person");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy("");
  }

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm" role="status" style={{ color: "var(--text-muted)" }}>{msg}</p>}

      {canManage && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-2xl border p-3"
          style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <label className="min-w-48 flex-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Add a chapter member
            <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...input, marginTop: 6 }}>
              <option value="">Choose someone…</option>
              {pool.map((p) => (
                <option key={p.user_id} value={p.user_id}>{p.name || p.user_id}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            As
            <select value={level} onChange={(e) => setLevel(e.target.value)} style={{ ...input, marginTop: 6 }}>
              <option value="general">General</option>
              <option value="core">Core</option>
            </select>
          </label>
          <button type="submit" style={btn} disabled={!pick || busy === "add"}>
            <UserPlus size={13} /> {busy === "add" ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {members.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No members yet. Add the first person above — joining is immediate.
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
          {members.map((m) => {
            const isHead = m.level === "dept_lead";
            const p = m.progress;
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 p-3.5">
                <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text)" }}>
                  <span className="flex flex-wrap items-baseline gap-2">
                    <Link
                      href={`/lead/members/${m.user_id}`}
                      prefetch={false}
                      className="font-medium hover:underline"
                      style={{ color: "var(--text)" }}
                    >
                      {m.name || "Unnamed member"}
                    </Link>
                    {m.user_id === meId && <span className="text-xs" style={{ color: "var(--text-muted)" }}>(you)</span>}
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {LEVEL_LABEL[m.level] || m.level}
                      {m.core_requested && m.level === "general" ? " · requested Core" : ""}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{p ? `${p.tier} · ${p.roadmapPct}% roadmap` : "no progress recorded"}</span>
                    <span>{p?.standing ? `#${p.standing.rank} of ${p.standing.total}` : "unranked"}</span>
                    <span>{p ? `${p.proofTotal} verified` : "0 verified"}</span>
                    <span>{p?.activity || "no activity recorded"}</span>
                  </span>
                </span>
                {isHead ? (
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <ShieldAlert size={13} /> Appointed by a Super Admin
                  </span>
                ) : canManage ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {m.level === "general" ? (
                      <button type="button" style={btn} disabled={busy === m.user_id}
                        onClick={() => setMemberLevel(m, "core")}>
                        <ArrowUp size={13} /> Promote to Core
                      </button>
                    ) : (
                      <button type="button" style={btn} disabled={busy === m.user_id}
                        onClick={() => setMemberLevel(m, "general")}>
                        <ArrowDown size={13} /> Move to General
                      </button>
                    )}
                    {m.core_requested && m.level === "general" && (
                      <DeclineCoreButton departmentId={departmentId} userId={m.user_id} name={m.name || "member"} />
                    )}
                    <button type="button" style={{ ...btn, color: "var(--danger)" }} disabled={busy === m.user_id}
                      onClick={() => remove(m)}>
                      <UserMinus size={13} /> Remove
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
