import { describe, expect, it } from "vitest";
import {
  canViewDepartment,
  catalogueIndex,
  departmentsForProfile,
  getDepartmentWorkspace,
  listWorkspaceDepartments
} from "@/lib/department-workspace";

// The workspace is the aggregated view of one department's work: who is in it,
// what it scheduled, what is late, what it reported, what it holds and what it
// spent. Authorization happens in the page via can(); these helpers answer
// "may this person open it at all" and "what is in there".

function recorder(results = []) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return Promise.resolve(results.shift() ?? []);
  };
  sql.calls = calls;
  return sql;
}

const DEPT = { id: "d-design", name: "Design", slug: "design", vertical: "non_technical" };

describe("canViewDepartment", () => {
  it("opens for admins and platform admins", () => {
    expect(canViewDepartment({ role: "admin", memberships: [] }, DEPT)).toBe(true);
    expect(canViewDepartment({ role: "platform_admin", memberships: [] }, DEPT)).toBe(true);
  });

  it("opens for a vertical lead inside their own vertical only", () => {
    expect(canViewDepartment({ role: "vertical_lead", vertical: "non_technical", memberships: [] }, DEPT)).toBe(true);
    expect(canViewDepartment({ role: "vertical_lead", vertical: "technical", memberships: [] }, DEPT)).toBe(false);
  });

  it("opens for a member of that department, whatever their level", () => {
    for (const level of ["general", "core", "dept_lead"]) {
      const profile = { role: "student", memberships: [{ department_id: "d-design", level }] };
      expect(canViewDepartment(profile, DEPT)).toBe(true);
    }
  });

  it("stays closed to everyone else", () => {
    expect(canViewDepartment({ role: "core", memberships: [{ department_id: "d-web", level: "core" }] }, DEPT)).toBe(false);
    expect(canViewDepartment({ role: "student", memberships: [] }, DEPT)).toBe(false);
    expect(canViewDepartment(null, DEPT)).toBe(false);
    expect(canViewDepartment({ role: "admin", memberships: [] }, null)).toBe(false);
  });
});

describe("departmentsForProfile", () => {
  const rows = [
    { id: "d-ai", vertical: "technical" },
    { id: "d-design", vertical: "non_technical" },
    { id: "d-smm", vertical: "non_technical" }
  ];

  it("shows an admin everything, in catalogue order", () => {
    expect(departmentsForProfile({ role: "admin", memberships: [] }, rows)).toEqual(rows);
  });

  it("shows a vertical lead their vertical", () => {
    expect(departmentsForProfile({ role: "vertical_lead", vertical: "non_technical", memberships: [] }, rows))
      .toEqual([rows[1], rows[2]]);
  });

  it("shows a head only the departments they belong to", () => {
    const profile = { role: "dept_lead", memberships: [{ department_id: "d-design", level: "dept_lead" }] };
    expect(departmentsForProfile(profile, rows)).toEqual([rows[1]]);
  });

  it("shows nothing without a profile", () => {
    expect(departmentsForProfile(null, rows)).toEqual([]);
  });
});

describe("catalogueIndex", () => {
  it("is a 1-based position in the shipped order", () => {
    expect(catalogueIndex("ai_ml")).toBe(1);
    expect(catalogueIndex("design")).toBe(7);
    expect(catalogueIndex("public_relations")).toBe(13);
  });

  it("returns null for an admin-created department the catalogue does not know", () => {
    expect(catalogueIndex("robotics")).toBeNull();
    expect(catalogueIndex("")).toBeNull();
  });
});

describe("listWorkspaceDepartments", () => {
  it("pins the query to the tenant and hides archived departments", async () => {
    const sql = recorder([[{ id: "d1" }]]);
    await expect(listWorkspaceDepartments(sql, "tenant-1")).resolves.toEqual([{ id: "d1" }]);
    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].text).toMatch(/d\.tenant_id = \?::uuid/);
    expect(sql.calls[0].values).toContain("tenant-1");
    expect(sql.calls[0].text).toMatch(/d\.is_active/);
  });

  it("counts only live operational work", async () => {
    const sql = recorder([[]]);
    await listWorkspaceDepartments(sql, "tenant-1");
    const text = sql.calls[0].text;
    // Open tasks exclude closed ones; upcoming events exclude the past.
    expect(text).toMatch(/t\.status <> 'done'/);
    expect(text).toMatch(/e\.starts_at >= NOW\(\)/);
    expect(text).toMatch(/e\.status = 'upcoming'/);
    // The department's own work board is counted separately from event ops.
    expect(text).toMatch(/FROM department_tasks/);
  });
});

describe("getDepartmentWorkspace", () => {
  it("reads every module for one department without batching", async () => {
    const sql = recorder([[], [], [], [], [], [], [], [], [], [], [], []]);
    const workspace = await getDepartmentWorkspace(sql, { tenantId: "tenant-1", department: DEPT });

    // one query per module, run in sequence
    expect(sql.calls).toHaveLength(12);
    expect(sql.calls.map((c) => c.text.slice(0, 6))).toEqual([
      "SELECT", "SELECT", "SELECT", "SELECT", "SELECT", "SELECT",
      "SELECT", "SELECT", "SELECT", "SELECT", "SELECT", "SELECT"
    ]);
    for (const key of ["heads", "members", "events", "tasks", "departmentTasks", "reports", "contributions", "assets", "expenses", "allocations", "mous", "directory"]) {
      expect(workspace[key]).toEqual([]);
    }
    expect(workspace.counts).toMatchObject({
      members: 0, heads: 0, upcoming: 0, openTasks: 0, openWork: 0, awaitingReview: 0, spent: 0, allocated: 0
    });
  });

  it("scopes department work to that department and that tenant", async () => {
    const sql = recorder([[], [], [], [], [], [], [], [], [], [], [], []]);
    await getDepartmentWorkspace(sql, { tenantId: "tenant-1", department: DEPT });
    const byTable = (needle) => sql.calls.find((c) => c.text.includes(needle));
    expect(byTable("FROM department_memberships").values).toContain("d-design");
    expect(byTable("FROM events").values).toContain("tenant-1");
    expect(byTable("FROM events").values).toContain("d-design");
    // MoUs are vertical-scoped in the schema: a department sees its own vertical.
    expect(byTable("FROM mous").values).toContain("non_technical");
    expect(byTable("FROM media_assets").text).toMatch(/department_id IS NULL/);
  });

  it("only counts approved or paid money as spent", async () => {
    const sql = recorder([
      [], [], [], [], [], [], [], [],
      [
        { amount: "1000", status: "approved" },
        { amount: "500", status: "paid" },
        { amount: "900", status: "pending" },
        { amount: "300", status: "rejected" }
      ],
      [{ name: "Design allocation", allocated: "5000" }],
      [], []
    ]);
    const { counts } = await getDepartmentWorkspace(sql, { tenantId: "tenant-1", department: DEPT });
    expect(counts.spent).toBe(1500);
    expect(counts.allocated).toBe(5000);
  });

  it("counts upcoming events and open tasks from the rows it read", async () => {
    const sql = recorder([
      [],
      [],
      [{ id: "e1", status: "upcoming" }, { id: "e2", status: "completed" }],
      [{ id: "t1", status: "open" }, { id: "t2", status: "done" }],
      [], [], [], [], [], [], [], []
    ]);
    const { counts } = await getDepartmentWorkspace(sql, { tenantId: "tenant-1", department: DEPT });
    expect(counts.upcoming).toBe(1);
    expect(counts.openTasks).toBe(1);
  });
});
