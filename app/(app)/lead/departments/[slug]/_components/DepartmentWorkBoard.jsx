"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { TaskList } from "@/components/department/TaskList";
import { TASK_KINDS, TASK_PRIORITIES, taskWorkload } from "@/lib/department-tasks";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

const button = {
  borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600,
  background: "var(--accent)", color: "var(--bg)", border: "none", cursor: "pointer"
};

const ghost = {
  ...button, background: "transparent", color: "var(--text)",
  border: "1px solid var(--line)"
};

/**
 * The department's own work board. Creation is shown only to a head/co-head;
 * every member of the department reads the same list, and only the assignee can
 * submit proof for their own row.
 */
export function DepartmentWorkBoard({
  departmentId,
  tasks = [],
  members = [],
  meId = null,
  canManage = false,
  canVerify = false
}) {
  const [rows, setRows] = useState(tasks);
  // TaskList owns its copy of the rows so a transition can update one card.
  // Bumping this key re-seeds it after a create, so the new task appears
  // without a page reload.
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Who is already carrying what. Computed from the rows this board is showing,
  // so the number next to a name cannot disagree with the cards underneath it.
  // Display only: it never disables an option or blocks an assignment.
  const workload = useMemo(() => taskWorkload(rows), [rows]);

  function workloadLabel(member) {
    const w = workload.get(member.user_id);
    if (!w) return " — free";
    const parts = [`${w.open} open`];
    if (w.overdue) parts.push(`${w.overdue} overdue`);
    if (w.dueSoon) parts.push(`${w.dueSoon} due soon`);
    if (w.blocked) parts.push(`${w.blocked} blocked`);
    return ` — ${parts.join(", ")}`;
  }

  async function create(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const rawDue = String(fd.get("dueAt") || "");
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/departments/${departmentId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: fd.get("title"),
          detail: fd.get("detail") || "",
          kind: fd.get("kind"),
          priority: fd.get("priority"),
          assigneeId: fd.get("assigneeId") || null,
          dueAt: rawDue ? new Date(`${rawDue}T18:00:00`).toISOString() : null
        })
      });
      const d = await res.json().catch(() => ({ ok: false }));
      if (d.ok) {
        const [fresh] = await refresh();
        setRows(fresh);
        setVersion((v) => v + 1);
        form.reset();
        setOpen(false);
        setMsg("Work assigned ✓");
      } else {
        setMsg(d.error?.message || "Could not assign that work");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy(false);
  }

  async function refresh() {
    const res = await fetch(`/api/departments/${departmentId}/tasks`);
    const d = await res.json().catch(() => ({ ok: false }));
    return d.ok ? [d.data.tasks ?? []] : [rows];
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Assigned inside this department. A submission needs an evidence link, and the person
          who submitted it cannot approve it.
        </p>
        {canManage && (
          <button type="button" style={open ? ghost : button} onClick={() => setOpen(!open)}>
            {open ? <X size={14} /> : <Plus size={14} />} {open ? "Close" : "Assign work"}
          </button>
        )}
      </div>

      {msg && <p className="text-sm" role="status" style={{ color: "var(--text-muted)" }}>{msg}</p>}

      {open && canManage && (
        <form onSubmit={create} className="space-y-3 rounded-2xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium sm:col-span-2" style={{ color: "var(--text-muted)" }}>
              What needs doing?
              <input name="title" required minLength={2} maxLength={160} style={{ ...input, marginTop: 6 }} />
            </label>
            <label className="block text-xs font-medium sm:col-span-2" style={{ color: "var(--text-muted)" }}>
              Detail
              <textarea name="detail" rows={2} maxLength={2000} style={{ ...input, marginTop: 6 }} />
            </label>
            <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Assign to
              <select name="assigneeId" style={{ ...input, marginTop: 6 }} defaultValue="">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {(m.name || m.user_id) + workloadLabel(m)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                Counts show who is already loaded. Nothing here blocks an assignment.
              </span>
            </label>
            <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Due
              <input name="dueAt" type="date" style={{ ...input, marginTop: 6 }} />
            </label>
            <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Kind
              <select name="kind" style={{ ...input, marginTop: 6 }} defaultValue="task">
                {TASK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Priority
              <select name="priority" style={{ ...input, marginTop: 6 }} defaultValue="medium">
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <button type="submit" style={button} disabled={busy}>
            <Plus size={14} /> {busy ? "Assigning…" : "Assign work"}
          </button>
        </form>
      )}

      <TaskList
        key={version}
        initialTasks={rows}
        meId={meId}
        canManage={canManage}
        canVerify={canVerify}
        members={members}
        showAssignee
        onTaskChange={(task) =>
          setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)))
        }
        onTaskRemove={(id) => setRows((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
