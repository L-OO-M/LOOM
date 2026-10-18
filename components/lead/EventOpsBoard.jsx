"use client";

import { useState } from "react";
import { Plus, Search, X, CheckCircle2, RotateCcw, Archive, CalendarClock } from "lucide-react";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

const KINDS = ["checklist", "logistics", "venue", "marketing", "finance", "volunteers", "other"];
const PRIORITIES = ["low", "medium", "high"];
const STATUSES = ["todo", "in_progress", "blocked", "done"];

const PRIORITY_STYLE = {
  high: { color: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 12%, var(--bg))" },
  medium: { color: "#d97706", bg: "color-mix(in srgb, #d97706 12%, var(--bg))" },
  low: { color: "var(--text-muted)", bg: "var(--bg)" }
};

function fmtDue(dueAt) {
  if (!dueAt) return null;
  return new Date(dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function dueState(task) {
  if (task.status === "done" || !task.due_at) return null;
  const ms = new Date(task.due_at).getTime() - Date.now();
  if (ms < 0) return "overdue";
  if (ms <= 7 * 86400000) return "soon";
  return null;
}

export function EventOpsBoard({ initialTasks = [], events = [], members = [], canManage = false }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("");
  const [dueSoon, setDueSoon] = useState(false);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load(next = {}) {
    const ev = next.eventId ?? eventId;
    const st = next.status ?? status;
    const due = next.dueSoon ?? dueSoon;
    const query = next.q ?? q;
    const p = new URLSearchParams();
    if (ev) p.set("event", ev);
    if (st) p.set("status", st);
    if (due) p.set("due", "soon");
    if (query.trim()) p.set("q", query.trim());
    try {
      const res = await fetch(`/api/lead/event-ops?${p.toString()}`);
      const d = await res.json();
      if (d.ok) setTasks(d.data.tasks ?? []);
      else setMsg(d.error?.message || "Could not load tasks");
    } catch {
      setMsg("Network error — try again");
    }
  }

  async function create(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const rawDue = fd.get("dueAt");
    const payload = {
      title: fd.get("title"), detail: fd.get("detail") || "",
      eventId: fd.get("eventId") || null, kind: fd.get("kind"), priority: fd.get("priority"),
      status: fd.get("status") || "todo", ownerId: fd.get("ownerId") || null,
      dueAt: rawDue ? new Date(rawDue).toISOString() : null
    };
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/lead/event-ops", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
      });
      const d = await res.json();
      if (d.ok) {
        form.reset();
        setShowForm(false);
        setMsg("Task added ✓");
        load();
      } else {
        setMsg(d.error?.message || "Could not save");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(false);
  }

  async function setStatusFor(task, nextStatus) {
    setMsg("Saving…");
    const res = await fetch(`/api/lead/event-ops/${task.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextStatus })
    });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) {
      setMsg("Updated ✓");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...d.data.task } : t)));
    } else {
      setMsg(d.error?.message || "Update failed");
    }
  }

  async function archive(task) {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    setMsg("Removing…");
    const res = await fetch(`/api/lead/event-ops/${task.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({ ok: false }));
    if (d.ok) {
      setMsg("Removed ✓");
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } else {
      setMsg(d.error?.message || "Remove failed");
    }
  }

  const ok = msg.includes("✓");
  const open = tasks.filter((t) => t.status !== "done").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={eventId} onChange={(e) => { setEventId(e.target.value); load({ eventId: e.target.value }); }}
          aria-label="Filter by event" className="max-w-56 rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">All events</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
        <select
          value={status} onChange={(e) => { setStatus(e.target.value); load({ status: e.target.value }); }}
          aria-label="Filter by status" className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={dueSoon} onChange={(e) => { setDueSoon(e.target.checked); load({ dueSoon: e.target.checked }); }} />
          Due within 7 days
        </label>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative ml-auto max-w-xs flex-1">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…"
            className="w-full rounded-xl border py-2 pl-7 pr-3 text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
          />
        </form>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} className="btn-ink !py-2 inline-flex items-center gap-1.5 text-sm">
            {showForm ? <X size={14} /> : <Plus size={14} />} {showForm ? "Close" : "Add task"}
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
          <input name="title" required minLength={2} maxLength={160} placeholder="Task (e.g. Book the auditorium)" style={input} />
          <select name="eventId" style={input} defaultValue="" aria-label="Event">
            <option value="">No event (chapter-wide)</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
          <select name="kind" style={input} defaultValue="checklist" aria-label="Kind">
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select name="priority" style={input} defaultValue="medium" aria-label="Priority">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select name="ownerId" style={input} defaultValue="" aria-label="Owner">
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.user_id}</option>)}
          </select>
          <label className="text-xs" style={{ color: "var(--text-muted)" }}>Due<input name="dueAt" type="datetime-local" style={input} /></label>
          <textarea name="detail" rows={2} maxLength={2000} placeholder="Notes (optional)" className="sm:col-span-2" style={input} />
          <button disabled={busy} className="btn-ink !py-2 justify-self-start text-sm disabled:opacity-50">{busy ? "Saving…" : "Add task"}</button>
        </form>
      )}

      <p className="meta mb-3">{open} open · {tasks.length - open} done</p>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <CalendarClock size={18} className="mx-auto" style={{ color: "var(--text-muted)" }} />
          <p className="mt-3 text-sm font-medium" style={{ color: "var(--text)" }}>No operations tasks yet</p>
          <p className="narrative mx-auto mt-2 max-w-md">
            {canManage ? "Add the chores that decide whether an event runs on time — venue, posters, reimbursements." : "No tasks have been added for this chapter yet."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const due = dueState(task);
            const done = task.status === "done";
            const pr = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.low;
            return (
              <li key={task.id} className="flex items-start gap-3 rounded-2xl border p-4" style={{ borderColor: due === "overdue" ? "color-mix(in srgb, var(--danger) 40%, var(--line))" : "var(--line)", background: "var(--bg-elevated)", opacity: done ? 0.72 : 1 }}>
                <span className="mt-0.5">
                  {canManage ? (
                    <button
                      onClick={() => setStatusFor(task, done ? "todo" : "done")}
                      aria-label={done ? "Reopen task" : "Mark task done"}
                      style={{ color: done ? "#16a34a" : "var(--text-muted)" }}
                    >
                      {done ? <CheckCircle2 size={18} /> : <RotateCcw size={16} />}
                    </button>
                  ) : (done ? <CheckCircle2 size={18} style={{ color: "#16a34a" }} /> : null)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`text-sm ${done ? "line-through" : ""}`} style={{ color: "var(--text)" }}>{task.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: pr.bg, color: pr.color }}>{task.priority}</span>
                    <span>{task.kind}</span>
                    {task.event_title && <span>· {task.event_title}</span>}
                    {task.owner_name && <span>· {task.owner_name}</span>}
                    {task.due_at && (
                      <span style={{ color: due ? "var(--danger)" : "var(--text-muted)" }}>
                        · due {fmtDue(task.due_at)}{due === "overdue" ? " (overdue)" : due === "soon" ? " (soon)" : ""}
                      </span>
                    )}
                    {task.status === "blocked" && <span style={{ color: "var(--danger)" }}>· blocked</span>}
                  </span>
                  {task.detail && <span className="mt-1 line-clamp-2 block text-xs leading-5" style={{ color: "var(--text-muted)" }}>{task.detail}</span>}
                </span>
                {canManage && (
                  <select
                    value={task.status}
                    onChange={(e) => setStatusFor(task, e.target.value)}
                    aria-label="Task status"
                    className="rounded-lg border px-2 py-1 text-xs"
                    style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                )}
                {canManage && (
                  <button onClick={() => archive(task)} aria-label="Delete task" style={{ color: "var(--danger)" }}>
                    <Archive size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
