"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const NEXT = { todo: "doing", doing: "done", done: "todo" };

export default function ProjectMilestonesPanel({ projectId, milestones = [], canEdit }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function call(url, options) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(url, options);
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "That did not work.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMsg("Network error — nothing was changed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    const saved = await call(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim() })
    });
    if (saved) setTitle("");
  }

  function advance(milestone) {
    if (busy) return;
    call(`/api/projects/${projectId}/milestones`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ milestoneId: milestone.id, status: NEXT[milestone.status] || "todo" })
    });
  }

  function remove(milestone) {
    if (busy) return;
    call(`/api/projects/${projectId}/milestones?milestoneId=${encodeURIComponent(milestone.id)}`, {
      method: "DELETE"
    });
  }

  return (
    <section aria-label="Project milestones" className="mt-8">
      <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>Milestones</h2>
      <p className="meta mt-1">A visible plan. Open · in progress · done.</p>
      <ol className="mt-3 divide-y overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        {milestones.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 p-4">
            <span className="min-w-0">
              <span className="block truncate text-sm" style={{ color: "var(--text)", textDecoration: m.status === "done" ? "line-through" : "none" }}>
                {m.title}
              </span>
              <span className="meta">{m.status}</span>
            </span>
            {canEdit && (
              <span className="flex shrink-0 items-center gap-3">
                <button type="button" disabled={busy} onClick={() => advance(m)} className="meta hover:underline disabled:opacity-50" style={{ color: "var(--accent)" }}>
                  {m.status === "done" ? "Reopen" : m.status === "doing" ? "Complete" : "Start"}
                </button>
                <button type="button" disabled={busy} onClick={() => remove(m)} className="meta hover:underline disabled:opacity-50" style={{ color: "var(--danger)" }}>
                  Remove
                </button>
              </span>
            )}
          </li>
        ))}
        {milestones.length === 0 && (
          <li className="p-4 meta">No milestones yet. Add the first step so the plan is visible.</li>
        )}
      </ol>

      {canEdit && (
        <form onSubmit={add} className="mt-3 flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Working auth and tests"
            maxLength={120}
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
          />
          <button type="submit" disabled={!title.trim() || busy} className="btn-ink !py-2 text-xs disabled:opacity-50">
            {busy ? "Saving…" : "Add"}
          </button>
        </form>
      )}
      {msg && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </section>
  );
}
