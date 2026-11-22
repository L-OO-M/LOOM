"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Play, Ban, RotateCcw, Send, Undo2, X, UserCog } from "lucide-react";
import { TASK_STATUS_LABEL, BLOCKED_CATEGORIES, BLOCKED_CATEGORY_LABEL } from "@/lib/department-tasks";

const input = {
  width: "100%", borderRadius: 10, border: "1px solid var(--line)",
  background: "var(--bg-muted)", color: "var(--text)", padding: "9px 12px", fontSize: 14
};

const btn = {
  borderRadius: 10, border: "1px solid var(--line)", padding: "6px 10px",
  fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--bg-elevated)",
  display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer"
};

const TONE = {
  assigned: "var(--text-muted)",
  in_progress: "var(--accent)",
  blocked: "var(--danger)",
  submitted: "#d97706",
  done: "#16a34a"
};

const day = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

const isOverdue = (task) =>
  !!task.due_at && !["done", "submitted"].includes(task.status) && new Date(task.due_at) < new Date();

/**
 * One shared rendering of department work for both surfaces: the head's board
 * and the member's "my work" page. Buttons are shown only for transitions the
 * API will actually allow; the server re-checks every one.
 */
export function TaskList({
  initialTasks = [],
  meId = null,
  canManage = false,
  canVerify = false,
  members = [],
  showAssignee = true,
  // Optional: lets the parent (the head's board) keep its own copy in step, so
  // workload figures do not drift from the cards after a transition.
  onTaskChange = null,
  onTaskRemove = null
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [submitFor, setSubmitFor] = useState(null);
  const [returnFor, setReturnFor] = useState(null);
  const [blockFor, setBlockFor] = useState(null);

  function replace(task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)));
  }

  async function act(task, payload) {
    setBusy(task.id);
    setMsg("");
    try {
      const res = await fetch(`/api/departments/${task.department_id}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const d = await res.json().catch(() => ({ ok: false }));
      if (d.ok) {
        if (payload.action === "cancel") {
          setTasks((prev) => prev.filter((t) => t.id !== task.id));
          onTaskRemove?.(task.id);
        } else {
          replace(d.data.task);
          onTaskChange?.(d.data.task);
        }
        setSubmitFor(null);
        setReturnFor(null);
        setBlockFor(null);
        setMsg("Saved ✓");
      } else {
        setMsg(d.error?.message || "That change was refused");
      }
    } catch {
      setMsg("Network error — try again");
    }
    setBusy("");
  }

  async function submit(e, task) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await act(task, {
      action: "submit",
      evidenceUrl: String(fd.get("evidenceUrl") || "").trim(),
      completionNote: String(fd.get("completionNote") || "").trim() || null
    });
  }

  if (!tasks.length) {
    return (
      <p className="rounded-2xl border p-5 text-sm" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
        Nothing assigned yet. Work given here carries a deadline, proof, and a named reviewer.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {msg && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }} role="status">{msg}</p>
      )}
      {tasks.map((task) => {
        const mine = !!meId && task.assignee_id === meId;
        const open = !["done"].includes(task.status);
        return (
          <article
            key={task.id}
            className="rounded-2xl border p-4"
            style={{
              borderColor: task.status === "submitted" ? "color-mix(in srgb, #d97706 45%, var(--line))" : "var(--line)",
              background: "var(--bg-elevated)"
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {task.title}
                  {mine && (
                    <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: "var(--bg-muted)", color: "var(--accent)" }}>
                      Yours
                    </span>
                  )}
                </p>
                {task.detail && (
                  <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--text-muted)" }}>{task.detail}</p>
                )}
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ color: TONE[task.status] || "var(--text-muted)", background: "var(--bg-muted)" }}
              >
                {TASK_STATUS_LABEL[task.status] || task.status}
              </span>
            </div>

            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>{task.kind} · {task.priority} priority</span>
              {showAssignee && (
                <span>{task.assignee_name ? `Assigned to ${task.assignee_name}` : "Unassigned"}</span>
              )}
              {task.due_at && (
                <span style={{ color: isOverdue(task) ? "var(--danger)" : "var(--text-muted)" }}>
                  Due {day(task.due_at)}{isOverdue(task) ? " · overdue" : ""}
                </span>
              )}
              {task.reviewed_by && (
                <span>Reviewed by {task.reviewer_name || "a head"} on {day(task.reviewed_at)}
                  {task.review_note ? ` — “${task.review_note}”` : ""}
                </span>
              )}
            </p>

            {task.evidence_url && (
              <p className="mt-2 text-xs">
                <a href={task.evidence_url} target="_blank" rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 underline underline-offset-4"
                  style={{ color: "var(--accent)" }}>
                  Evidence <ExternalLink size={12} />
                </a>
                {task.completion_note ? (
                  <span style={{ color: "var(--text-muted)" }}> · {task.completion_note}</span>
                ) : null}
              </p>
            )}

            {task.status === "blocked" && task.blocked_reason && (
              <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
                Blocked: {task.blocked_reason}
                {task.blocked_category
                  ? ` · ${BLOCKED_CATEGORY_LABEL[task.blocked_category] || task.blocked_category}`
                  : ""}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {mine && ["assigned", "blocked"].includes(task.status) && (
                <button type="button" style={btn} disabled={busy === task.id} onClick={() => act(task, { action: "start" })}>
                  <Play size={13} /> Start
                </button>
              )}
              {mine && ["assigned", "in_progress"].includes(task.status) && (
                <button type="button" style={btn} disabled={busy === task.id}
                  onClick={() => setBlockFor(blockFor === task.id ? null : task.id)}>
                  <Ban size={13} /> Blocked
                </button>
              )}
              {mine && ["assigned", "in_progress", "blocked"].includes(task.status) && (
                <button type="button" style={{ ...btn, color: "var(--accent)" }} disabled={busy === task.id}
                  onClick={() => setSubmitFor(submitFor === task.id ? null : task.id)}>
                  <Send size={13} /> Submit proof
                </button>
              )}

              {canVerify && task.status === "submitted" && task.submitted_by !== meId && (
                <>
                  <button type="button" style={{ ...btn, color: "#16a34a" }} disabled={busy === task.id}
                    onClick={() => act(task, { action: "approve" })}>
                    <CheckCircle2 size={13} /> Approve
                  </button>
                  <button type="button" style={{ ...btn, color: "var(--danger)" }} disabled={busy === task.id}
                    onClick={() => setReturnFor(returnFor === task.id ? null : task.id)}>
                    <Undo2 size={13} /> Return
                  </button>
                </>
              )}
              {canVerify && task.status === "submitted" && task.submitted_by === meId && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  A Co-Head must review this — nobody approves their own submission.
                </span>
              )}

              {canManage && task.status === "done" && (
                <button type="button" style={btn} disabled={busy === task.id} onClick={() => act(task, { action: "reopen" })}>
                  <RotateCcw size={13} /> Reopen
                </button>
              )}
              {canManage && open && (
                <button type="button" style={{ ...btn, color: "var(--text-muted)" }} disabled={busy === task.id}
                  onClick={() => {
                    if (window.confirm(`Cancel “${task.title}”? The record stays in the audit log.`)) {
                      act(task, { action: "cancel" });
                    }
                  }}>
                  <X size={13} /> Cancel
                </button>
              )}
              {canManage && members.length > 0 && open && task.status !== "submitted" && (
                <span className="inline-flex items-center gap-1.5">
                  <UserCog size={13} style={{ color: "var(--text-muted)" }} />
                  <select
                    aria-label={`Reassign ${task.title}`}
                    defaultValue={task.assignee_id || ""}
                    disabled={busy === task.id}
                    style={{ ...input, width: "auto", padding: "5px 8px", fontSize: 12 }}
                    onChange={(e) => act(task, { action: "update", assigneeId: e.target.value || null })}
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.name || m.user_id}</option>
                    ))}
                  </select>
                </span>
              )}
            </div>

            {submitFor === task.id && (
              <form onSubmit={(e) => submit(e, task)} className="mt-3 space-y-2 rounded-xl border p-3"
                style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
                <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Evidence link (required)
                  <input name="evidenceUrl" type="url" required placeholder="https://github.com/…"
                    style={{ ...input, marginTop: 6 }} />
                </label>
                <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  What did you do?
                  <textarea name="completionNote" rows={2} maxLength={2000} style={{ ...input, marginTop: 6 }} />
                </label>
                <div className="flex gap-2">
                  <button type="submit" style={{ ...btn, color: "var(--accent)" }} disabled={busy === task.id}>
                    <Send size={13} /> Send for review
                  </button>
                  <button type="button" style={btn} onClick={() => setSubmitFor(null)}>Cancel</button>
                </div>
              </form>
            )}

            {blockFor === task.id && (
              <form
                className="mt-3 space-y-2 rounded-xl border p-3"
                style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  act(task, {
                    action: "block",
                    blockedReason: String(fd.get("blockedReason") || "").trim(),
                    blockedCategory: String(fd.get("blockedCategory") || "") || null
                  });
                }}
              >
                <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  What is stopping this? (required)
                  <textarea name="blockedReason" rows={2} required maxLength={500}
                    placeholder="Waiting on repo access from the maintainer"
                    style={{ ...input, marginTop: 6 }} />
                </label>
                <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Kind of blocker
                  <select name="blockedCategory" defaultValue="" style={{ ...input, marginTop: 6 }}>
                    <option value="">Not sure</option>
                    {BLOCKED_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{BLOCKED_CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <button type="submit" style={{ ...btn, color: "var(--danger)" }} disabled={busy === task.id}>
                    <Ban size={13} /> Mark blocked
                  </button>
                  <button type="button" style={btn} onClick={() => setBlockFor(null)}>Cancel</button>
                </div>
              </form>
            )}

            {returnFor === task.id && (
              <form
                className="mt-3 space-y-2 rounded-xl border p-3"
                style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const note = String(new FormData(e.currentTarget).get("reviewNote") || "").trim();
                  act(task, { action: "return", reviewNote: note });
                }}
              >
                <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  What needs to change? (required)
                  <textarea name="reviewNote" rows={2} required maxLength={2000} style={{ ...input, marginTop: 6 }} />
                </label>
                <div className="flex gap-2">
                  <button type="submit" style={{ ...btn, color: "var(--danger)" }} disabled={busy === task.id}>
                    <Undo2 size={13} /> Return to assignee
                  </button>
                  <button type="button" style={btn} onClick={() => setReturnFor(null)}>Cancel</button>
                </div>
              </form>
            )}
          </article>
        );
      })}
    </div>
  );
}
