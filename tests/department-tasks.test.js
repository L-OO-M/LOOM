import { describe, expect, it } from "vitest";
import {
  TASK_STATUSES,
  OPEN_TASK_STATUSES,
  TASK_FILTERS,
  TASK_STAGES,
  decideTaskAction,
  denyMessage,
  filterTasks,
  groupTasksByStage,
  isTaskOverdue,
  matchesTaskFilter,
  taskFilterCounts
} from "@/lib/department-tasks";

const HEAD = "head-a";
const COHEAD = "head-b";
const MEMBER = "member-a";

const task = (over = {}) => ({
  id: "task-1",
  is_active: true,
  status: "assigned",
  assignee_id: MEMBER,
  submitted_by: null,
  ...over
});

const decide = (action, over = {}, flags = {}) =>
  decideTaskAction({ action, task: task(over), actorId: MEMBER, canManage: false, canVerify: false, ...flags });

describe("department task transitions", () => {
  it("declares one status vocabulary", () => {
    expect(TASK_STATUSES).toEqual(["assigned", "in_progress", "blocked", "submitted", "done"]);
    expect(OPEN_TASK_STATUSES).toEqual(["assigned", "in_progress", "blocked", "submitted"]);
  });

  it("lets the assignee move their own work forward", () => {
    expect(decide("start").patch).toEqual({ status: "in_progress" });
    expect(decide("block", { status: "in_progress" }).patch).toEqual({ status: "blocked" });
    expect(decide("submit", { status: "in_progress" })).toEqual({ ok: true, patch: { status: "submitted" } });
    expect(decide("start", { status: "blocked" }).patch).toEqual({ status: "in_progress" });
  });

  it("refuses moves that do not belong to the current state", () => {
    expect(decide("submit", { status: "assigned" }).ok).toBe(true);
    expect(decide("start", { status: "in_progress" }).reason).toBe("wrong_status");
    expect(decide("start", { status: "submitted" }).reason).toBe("wrong_status");
    expect(decide("reopen", { status: "submitted" }).reason).toBe("forbidden"); // assignee is not a manager
  });

  it("keeps submission with the assignee", () => {
    expect(decide("submit", {}, { actorId: HEAD, canManage: true }).reason).toBe("forbidden");
  });

  it("never lets a person approve or return their own submission", () => {
    const submitted = { status: "submitted", submitted_by: MEMBER };
    expect(decide("approve", submitted, { actorId: MEMBER, canVerify: true }).reason).toBe("self_review");
    expect(decide("return", submitted, { actorId: MEMBER, canVerify: true }).reason).toBe("self_review");
    expect(denyMessage("self_review")).toMatch(/cannot be approved/);
  });

  it("lets the other head approve the submission", () => {
    const submitted = { status: "submitted", submitted_by: MEMBER };
    const r = decideTaskAction({
      action: "approve", task: task(submitted), actorId: COHEAD, canManage: true, canVerify: true
    });
    expect(r).toEqual({ ok: true, patch: { status: "done" } });
  });

  it("lets a head return work with a reason, and reopen approved work", () => {
    const submitted = { status: "submitted", submitted_by: MEMBER };
    expect(decide("return", submitted, { actorId: HEAD, canVerify: true }).patch).toEqual({ status: "in_progress" });
    expect(decide("reopen", { status: "done" }, { actorId: HEAD, canManage: true }).patch).toEqual({ status: "in_progress" });
    expect(decide("reopen", { status: "submitted" }, { actorId: HEAD, canManage: true }).reason).toBe("wrong_status");
  });

  it("cancels only for managers, and a cancelled task is closed", () => {
    expect(decide("cancel", {}, { actorId: HEAD, canManage: true })).toEqual({ ok: true, patch: { is_active: false } });
    expect(decide("cancel").reason).toBe("forbidden");
    expect(decide("start", { is_active: false }, { actorId: HEAD, canManage: true }).reason).toBe("inactive");
  });

  it("denies unknown actions instead of falling through", () => {
    expect(decide("teleport").reason).toBe("unknown_action");
    expect(decideTaskAction({ action: "start", task: null, actorId: MEMBER }).reason).toBe("not_found");
  });
});

describe("task views", () => {
  const now = Date.parse("2026-03-10T12:00:00Z");
  const rows = [
    { id: "a", status: "assigned", assignee_id: MEMBER, due_at: "2026-03-01T00:00:00Z" },
    { id: "b", status: "in_progress", assignee_id: HEAD, due_at: "2026-03-20T00:00:00Z" },
    { id: "c", status: "submitted", assignee_id: MEMBER, due_at: "2026-03-05T00:00:00Z" },
    { id: "d", status: "done", assignee_id: MEMBER, due_at: null },
    { id: "e", status: "blocked", assignee_id: HEAD, due_at: null }
  ];

  it("treats only unfinished, past-due work as overdue", () => {
    expect(isTaskOverdue(rows[0], now)).toBe(true);
    expect(isTaskOverdue(rows[1], now)).toBe(false);
    // Submitted work is waiting on a reviewer, so the assignee is not late.
    expect(isTaskOverdue(rows[2], now)).toBe(false);
    expect(isTaskOverdue(rows[3], now)).toBe(false);
    expect(isTaskOverdue({ status: "assigned", due_at: null }, now)).toBe(false);
  });

  it("counts every filter from the same rows", () => {
    const counts = taskFilterCounts(rows, { meId: MEMBER, now });
    expect(counts.all).toBe(5);
    expect(counts.open).toBe(4);
    expect(counts.review).toBe(1);
    expect(counts.overdue).toBe(1);
    expect(counts.mine).toBe(3);
  });

  it("filters without mutating the source", () => {
    expect(filterTasks(rows, "all", { now })).toBe(rows);
    expect(filterTasks(rows, "review", { now }).map((t) => t.id)).toEqual(["c"]);
    expect(filterTasks(rows, "overdue", { now }).map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(rows, "mine", { meId: HEAD, now }).map((t) => t.id)).toEqual(["b", "e"]);
    expect(rows).toHaveLength(5);
    expect(matchesTaskFilter(rows[0], "unknown", { now })).toBe(true);
  });

  it("groups by the stage that owns the next action and drops empty stages", () => {
    const groups = groupTasksByStage(rows);
    expect(groups.map((g) => g.id)).toEqual(["assigned", "in_progress", "blocked", "submitted", "done"]);
    expect(groups.find((g) => g.id === "submitted").tasks.map((t) => t.id)).toEqual(["c"]);
    expect(groupTasksByStage([{ id: "x", status: "done" }]).map((g) => g.id)).toEqual(["done"]);
    expect(groupTasksByStage([])).toEqual([]);
  });

  it("keeps the filter and stage vocabularies in step with task statuses", () => {
    for (const stage of TASK_STAGES) {
      for (const status of stage.statuses) expect(TASK_STATUSES).toContain(status);
    }
    expect(TASK_FILTERS.map((f) => f.id)).toContain("overdue");
  });
});
