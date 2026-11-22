import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCKED_CATEGORIES, BLOCKED_CATEGORY_LABEL } from "@/lib/department-tasks";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

describe("blocked work carries a reason", () => {
  it("keeps the JS vocabulary identical to the database CHECK", () => {
    // Duplicated on purpose -- the database must be able to refuse an invalid
    // category without asking the application what the rule is -- but drift
    // between the two is a silent bug, so it is asserted here.
    const sql = read("load/migrations/100_department_task_deadlines.sql");
    const check = sql.match(/blocked_category IN \(([\s\S]*?)\)/);
    expect(check).toBeTruthy();
    const inSql = [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...BLOCKED_CATEGORIES].sort());
  });

  it("labels every category, so the UI never renders a raw enum", () => {
    for (const category of BLOCKED_CATEGORIES) {
      expect(typeof BLOCKED_CATEGORY_LABEL[category]).toBe("string");
      expect(BLOCKED_CATEGORY_LABEL[category].length).toBeGreaterThan(3);
    }
  });

  it("refuses a block without a reason before it reaches the database", () => {
    const route = read("app/api/departments/[id]/tasks/[taskId]/route.js");
    expect(route).toContain('nextStatus === "blocked"');
    expect(route).toContain("before marking it blocked");
  });

  it("clears the reason when the work is no longer blocked", () => {
    // A resolved task must not carry a stale reason into the queue.
    const route = read("app/api/departments/[id]/tasks/[taskId]/route.js");
    expect(route).toMatch(/blocked_reason = CASE WHEN \$\{nextStatus\} = 'blocked'/);
    expect(route).toMatch(/blocked_category = CASE WHEN \$\{nextStatus\} = 'blocked'/);
  });
});

describe("deadline reminders for department work", () => {
  it("uses two stamps, not one", () => {
    // One stamp cannot express "warned at T-2" and "told them it is late".
    const sql = read("load/migrations/100_department_task_deadlines.sql");
    expect(sql).toContain("due_soon_reminded_at");
    expect(sql).toContain("overdue_notified_at");
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS reminded_at/);
  });

  it("re-arms both stamps when a deadline moves", () => {
    const route = read("app/api/departments/[id]/tasks/[taskId]/route.js");
    expect(route).toContain("dueChanged");
    expect(route).toMatch(/due_soon_reminded_at = CASE WHEN \$\{dueChanged\} THEN NULL/);
    expect(route).toMatch(/overdue_notified_at = CASE WHEN \$\{dueChanged\} THEN NULL/);
  });

  it("claims the row before notifying, so an overlapping run cannot double-send", () => {
    const scheduler = read("lib/scheduler.js");
    const overdueBlock = scheduler.slice(scheduler.indexOf("const overdueWork"));
    const claim = overdueBlock.indexOf("UPDATE department_tasks SET overdue_notified_at = NOW()");
    const insert = overdueBlock.indexOf("INSERT INTO notifications");
    expect(claim).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(claim);
    expect(overdueBlock).toContain("overdue_notified_at IS NULL");
  });

  it("tells the assignee and the department's heads when work is late", () => {
    const scheduler = read("lib/scheduler.js");
    const overdueBlock = scheduler.slice(scheduler.indexOf("const overdueWork"));
    expect(overdueBlock).toContain("department_memberships");
    expect(overdueBlock).toContain("level = 'dept_lead'");
    expect(overdueBlock).toContain("/student/work");
    expect(overdueBlock).toContain("/lead/departments/");
  });
});
