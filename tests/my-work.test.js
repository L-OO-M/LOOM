import { describe, expect, it } from "vitest";
import {
  MY_WORK_SOURCES,
  loadMyWork,
  parseWorkKey,
  summarizeMyWork,
  workKey
} from "@/lib/my-work";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "auth0|member";

const NOW = new Date("2026-11-22T12:00:00.000Z").getTime();
const day = 86400000;
const at = (days) => new Date(NOW + days * day).toISOString();

describe("namespaced work keys", () => {
  it("separates the two sources even when the ids collide", () => {
    // Both tables use uuid primary keys; without the prefix a list that merges
    // them could key two different rows to the same React child.
    expect(workKey("department", "abc")).toBe("department:abc");
    expect(workKey("event", "abc")).toBe("event:abc");
    expect(workKey("department", "abc")).not.toBe(workKey("event", "abc"));
  });

  it("round-trips", () => {
    expect(parseWorkKey(workKey("event", "5f0f"))) .toEqual({ source: "event", id: "5f0f" });
  });

  it("refuses a source it does not own", () => {
    expect(() => workKey("planner", "x")).toThrow(/Unknown work source/);
    expect(parseWorkKey("planner:x")).toBe(null);
    expect(parseWorkKey("department:")).toBe(null);
    expect(parseWorkKey("")).toBe(null);
  });

  it("declares exactly the sources the page renders", () => {
    expect([...MY_WORK_SOURCES]).toEqual(["department", "event"]);
  });
});

describe("summarizeMyWork", () => {
  it("counts open department work the way the page always has", () => {
    const summary = summarizeMyWork({
      department: [
        { status: "assigned" },
        { status: "in_progress" },
        { status: "blocked" },
        { status: "submitted" },
        { status: "done" }
      ],
      now: NOW
    });
    // `submitted` is still somebody's problem until it is approved.
    expect(summary.departmentOpen).toBe(4);
    expect(summary.departmentAwaitingReview).toBe(1);
  });

  it("never calls an approved or submitted row overdue", () => {
    const summary = summarizeMyWork({
      department: [
        { status: "assigned", due_at: at(-2) },
        { status: "submitted", due_at: at(-2) },
        { status: "done", due_at: at(-2) }
      ],
      event: [
        { status: "todo", due_at: at(-1) },
        { status: "done", due_at: at(-1) }
      ],
      now: NOW
    });
    expect(summary.departmentOverdue).toBe(1);
    expect(summary.eventOverdue).toBe(1);
  });

  it("keeps event vocabulary separate from department vocabulary", () => {
    // `todo` exists only in event ops, `assigned` only in department work.
    const summary = summarizeMyWork({
      department: [],
      event: [{ status: "todo" }, { status: "in_progress" }, { status: "done" }],
      now: NOW
    });
    expect(summary.departmentOpen).toBe(0);
    expect(summary.eventOpen).toBe(2);
    expect(summary.totalOpen).toBe(2);
  });

  it("survives an empty day", () => {
    expect(summarizeMyWork()).toEqual({
      departmentOpen: 0,
      departmentAwaitingReview: 0,
      departmentOverdue: 0,
      eventOpen: 0,
      eventOverdue: 0,
      totalOpen: 0
    });
  });
});

describe("loadMyWork", () => {
  function fakeSql({ department = [], event = [] }) {
    const seen = [];
    const sql = (strings) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      seen.push(text);
      if (/FROM department_tasks/.test(text)) return Promise.resolve(department);
      if (/FROM event_ops_tasks/.test(text)) return Promise.resolve(event);
      throw new Error(`unexpected query: ${text}`);
    };
    return { sql, seen };
  }

  it("tags every row with its source and a namespaced key", async () => {
    const { sql } = fakeSql({
      department: [{ id: "d1", status: "assigned" }],
      event: [{ id: "e1", status: "todo" }]
    });
    const work = await loadMyWork(sql, { tenantId: TENANT, userId: USER, now: NOW });
    expect(work.department[0]).toMatchObject({ source: "department", key: "department:d1" });
    expect(work.event[0]).toMatchObject({ source: "event", key: "event:e1" });
    expect(work.summary.totalOpen).toBe(2);
  });

  it("asks each source only for this person's work", async () => {
    const { sql, seen } = fakeSql({});
    await loadMyWork(sql, { tenantId: TENANT, userId: USER, now: NOW });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatch(/assignee_id = \?/);
    expect(seen[1]).toMatch(/owner_id = \?/);
  });

  it("stays read-only", async () => {
    const { sql, seen } = fakeSql({});
    await loadMyWork(sql, { tenantId: TENANT, userId: USER, now: NOW });
    for (const text of seen) {
      expect(text).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    }
  });
});
