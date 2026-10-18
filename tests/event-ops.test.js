import { describe, expect, it } from "vitest";
import { TASK_KINDS, TASK_PRIORITIES, TASK_STATUSES, listTasks, getTask } from "@/lib/event-ops";

function recorder(results) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(results.shift() ?? []);
  };
  sql.calls = calls;
  return sql;
}

describe("event ops constants", () => {
  it("keeps the documented sets", () => {
    expect(TASK_STATUSES).toEqual(["todo", "in_progress", "blocked", "done"]);
    expect(TASK_PRIORITIES).toEqual(["low", "medium", "high"]);
    expect(TASK_KINDS).toContain("venue");
  });
});

describe("event ops queries", () => {
  it("scopes the task list to the tenant", async () => {
    const rows = [{ id: "t1", title: "Book auditorium" }];
    const sql = recorder([rows]);
    const result = await listTasks(sql, { tenantId: "tenant-1" });
    expect(result).toEqual(rows);
    expect(sql.calls[0].values).toContain("tenant-1");
  });

  it("passes event/status/owner/due filters through", async () => {
    const sql = recorder([[]]);
    await listTasks(sql, {
      tenantId: "tenant-1", eventId: "e1", status: "todo", ownerId: "u1", dueSoon: true, q: "book"
    });
    const values = sql.calls[0].values;
    expect(values).toContain("tenant-1");
    expect(values).toContain("e1");
    expect(values).toContain("todo");
    expect(values).toContain("u1");
    expect(values).toContain(true);
    expect(values).toContain("book");
  });

  it("returns one task scoped to the tenant", async () => {
    const sql = recorder([[{ id: "t1", title: "Book auditorium" }]]);
    expect((await getTask(sql, { tenantId: "tenant-1", id: "t1" })).title).toBe("Book auditorium");
  });

  it("returns null when the task is not in this tenant", async () => {
    expect(await getTask(recorder([[]]), { tenantId: "tenant-1", id: "t1" })).toBeNull();
  });
});
