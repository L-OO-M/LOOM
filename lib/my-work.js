import { OPEN_TASK_STATUSES, listTasksForAssignee } from "./department-tasks";
import { listTasks } from "./event-ops";

/**
 * One person's work, read from the systems that already own it.
 *
 * This is deliberately NOT a third task system. Nothing here is stored, and
 * nothing here can be written: each source keeps its own status vocabulary,
 * its own transition rules and its own action handlers. The only thing this
 * module adds is a namespace (`department:<id>`, `event:<id>`) so two rows that
 * happen to share a UUID can never be confused for each other in a list, and a
 * summary that answers "how much of this is actually mine right now".
 */
export const MY_WORK_SOURCES = Object.freeze(["department", "event"]);

export const MY_WORK_SOURCE_LABEL = Object.freeze({
  department: "Department work",
  event: "Event operations"
});

/** `department:<uuid>` -- stable across both sources. */
export function workKey(source, id) {
  if (!MY_WORK_SOURCES.includes(source)) {
    throw new Error(`Unknown work source: ${source}`);
  }
  return `${source}:${id}`;
}

export function parseWorkKey(key) {
  const [source, ...rest] = String(key || "").split(":");
  const id = rest.join(":");
  if (!MY_WORK_SOURCES.includes(source) || !id) return null;
  return { source, id };
}

const isOpen = (task) => OPEN_TASK_STATUSES.includes(task.status);
const isOverdue = (task, now) => {
  if (!task.due_at || task.status === "done" || task.status === "submitted") return false;
  const due = new Date(task.due_at).getTime();
  return Number.isFinite(due) && due < now;
};

/**
 * Counts, derived from the rows the page is about to render, so the numbers at
 * the top can never disagree with the list below.
 */
export function summarizeMyWork({ department = [], event = [], now = Date.now() } = {}) {
  return {
    departmentOpen: department.filter(isOpen).length,
    departmentAwaitingReview: department.filter((t) => t.status === "submitted").length,
    departmentOverdue: department.filter((t) => isOverdue(t, now)).length,
    eventOpen: event.filter((t) => t.status !== "done").length,
    eventOverdue: event.filter((t) => isOverdue(t, now)).length,
    totalOpen:
      department.filter(isOpen).length + event.filter((t) => t.status !== "done").length
  };
}

/**
 * Both sources, sequentially. The pool is capped at ten connections and page
 * queries stay sequential by house rule, so this is two awaits, not a
 * Promise.all.
 */
export async function loadMyWork(sql, { tenantId, userId, now = Date.now() } = {}) {
  const department = (await listTasksForAssignee(sql, { tenantId, userId })).map((task) => ({
    ...task,
    source: "department",
    key: workKey("department", task.id)
  }));
  const event = (await listTasks(sql, { tenantId, ownerId: userId })).map((task) => ({
    ...task,
    source: "event",
    key: workKey("event", task.id)
  }));
  return {
    department,
    event,
    summary: summarizeMyWork({ department, event, now })
  };
}
