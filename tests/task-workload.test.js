import { describe, expect, it } from "vitest";
import { taskWorkload } from "@/lib/department-tasks";

const NOW = new Date("2026-11-22T12:00:00.000Z").getTime();
const day = 86400000;
const at = (days) => new Date(NOW + days * day).toISOString();

const task = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  assignee_id: "u1",
  status: "assigned",
  due_at: null,
  ...over
});

describe("taskWorkload", () => {
  it("counts only work that is still open", () => {
    const map = taskWorkload(
      [
        task({ status: "assigned" }),
        task({ status: "in_progress" }),
        task({ status: "blocked" }),
        task({ status: "submitted" }),
        task({ status: "done" })
      ],
      { now: NOW }
    );
    expect(map.get("u1")).toEqual({ open: 3, overdue: 0, dueSoon: 0, blocked: 1 });
  });

  it("separates overdue from due soon at the boundary", () => {
    const map = taskWorkload(
      [
        task({ due_at: at(-1) }),   // overdue
        task({ due_at: at(1) }),    // due soon
        task({ due_at: at(2.9) }),  // due soon
        task({ due_at: at(5) }),    // neither
        task({ due_at: null })      // no deadline, still open
      ],
      { now: NOW }
    );
    expect(map.get("u1")).toEqual({ open: 5, overdue: 1, dueSoon: 2, blocked: 0 });
  });

  it("ignores unassigned work, because nobody is loaded by it", () => {
    const map = taskWorkload([task({ assignee_id: null }), task({ assignee_id: "u2" })], { now: NOW });
    expect(map.has(null)).toBe(false);
    expect(map.get("u2").open).toBe(1);
    expect(map.size).toBe(1);
  });

  it("keeps each person separate", () => {
    const map = taskWorkload(
      [task({ assignee_id: "a" }), task({ assignee_id: "a" }), task({ assignee_id: "b" })],
      { now: NOW }
    );
    expect(map.get("a").open).toBe(2);
    expect(map.get("b").open).toBe(1);
  });

  it("survives an empty board", () => {
    expect(taskWorkload([], { now: NOW }).size).toBe(0);
    expect(taskWorkload(undefined, { now: NOW }).size).toBe(0);
  });

  it("does not count a malformed due date as overdue", () => {
    const map = taskWorkload([task({ due_at: "not a date" })], { now: NOW });
    expect(map.get("u1")).toEqual({ open: 1, overdue: 0, dueSoon: 0, blocked: 0 });
  });
});
