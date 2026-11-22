import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDefinitions, QUEUE_GROUPS } from "@/lib/queue";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

describe("operational queue", () => {
  it("is a read-only aggregation over tables other modules own", () => {
    // The whole design is that the queue never becomes a second task system.
    // If it ever writes, that property is gone.
    const source = read("lib/queue.js");
    expect(source).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(source).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    expect(source).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("never tells a department head that a seat decision is their action", () => {
    // A head cannot approve a seat. Showing it as action would put a number on
    // their desk they have no button for.
    const head = buildDefinitions({ admin: false, vertical: false });
    const seat = head.find((d) => d.key === "seat_requests");
    expect(seat.group).toBe(QUEUE_GROUPS.ATTENTION);
    expect(seat.href).toBe("/lead/roster");
  });

  it("does tell an admin that a seat decision is their action", () => {
    for (const viewer of [{ admin: true }, { admin: false, vertical: true }]) {
      const seat = buildDefinitions(viewer).find((d) => d.key === "seat_requests");
      expect(seat.group).toBe(QUEUE_GROUPS.ACTION);
    }
    expect(buildDefinitions({ admin: true }).find((d) => d.key === "seat_requests").href).toBe(
      "/admin/requests"
    );
  });

  it("keeps work that is merely due soon out of the debt total", () => {
    const dueSoon = buildDefinitions({}).find((d) => d.key === "due_soon_work");
    expect(dueSoon.group).toBe(QUEUE_GROUPS.VISIBILITY);
    expect(dueSoon.group).not.toBe(QUEUE_GROUPS.ACTION);
    expect(dueSoon.group).not.toBe(QUEUE_GROUPS.ATTENTION);
  });

  it("sends every item to a real in-app route", () => {
    for (const definition of buildDefinitions({ admin: true })) {
      expect(definition.key).toMatch(/^[a-z_]+$/);
      expect(definition.label.length).toBeGreaterThan(3);
      expect(definition.href.startsWith("/")).toBe(true);
      expect(Object.values(QUEUE_GROUPS)).toContain(definition.group);
    }
  });

  it("points department-scoped work at the one department the viewer leads", () => {
    const definitions = buildDefinitions({ admin: false }, "/lead/departments/ai-ml");
    const scoped = definitions.filter((d) =>
      ["task_reviews", "overdue_work", "blocked_work", "unassigned_work", "due_soon_work"].includes(d.key)
    );
    expect(scoped).toHaveLength(5);
    for (const item of scoped) expect(item.href).toBe("/lead/departments/ai-ml");
  });
});
