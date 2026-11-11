"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProjectTeamPanel({ projectId, members = [], candidates = [], owner, canManage }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function add(e) {
    e.preventDefault();
    if (!userId || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}/team`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, role })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Could not add that person.");
        return;
      }
      setUserId("");
      router.refresh();
    } catch {
      setMsg("Network error — nobody was added.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(memberId) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}/team?userId=${encodeURIComponent(memberId)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Could not remove that person.");
        return;
      }
      router.refresh();
    } catch {
      setMsg("Network error — the team was not changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Project team" className="mt-8">
      <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>Team</h2>
      <ul className="mt-3 divide-y overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <li className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{owner?.name || "Owner"}</span>
          <span className="meta">owner</span>
        </li>
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 p-4">
            <span className="min-w-0 truncate text-sm" style={{ color: "var(--text)" }}>
              {m.name || m.user_id.slice(0, 8)}
              {m.github_username ? <span className="meta"> · @{m.github_username}</span> : null}
            </span>
            <span className="flex items-center gap-3">
              <span className="meta">{m.role}</span>
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(m.user_id)}
                  className="meta hover:underline disabled:opacity-50"
                  style={{ color: "var(--danger)" }}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
        {members.length === 0 && (
          <li className="p-4 meta">No collaborators yet. A project can be built alone.</li>
        )}
      </ul>

      {canManage && (
        <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="meta">Add a chapter member</span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
            >
              <option value="">Choose a person</option>
              {candidates.map((c) => (
                <option key={c.user_id} value={c.user_id}>{c.name || c.user_id}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="meta">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
            >
              <option value="member">Member</option>
              <option value="maintainer">Maintainer</option>
            </select>
          </label>
          <button type="submit" disabled={!userId || busy} className="btn-ink !py-2 text-xs disabled:opacity-50">
            {busy ? "Saving…" : "Add"}
          </button>
        </form>
      )}
      {msg && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </section>
  );
}
