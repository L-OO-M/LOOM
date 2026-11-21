import { describe, expect, it, vi } from "vitest";

// Route-level guards for the department kit: a head acts inside one department,
// a Head's seat is an appointment, and a submission cannot be approved by the
// person who submitted it. These pin the boundary, not the SQL text.

const TENANT = "11111111-1111-4111-8111-111111111111";
const DEPT = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const HEAD = "head-a";
const TARGET = "member-b";

function recorder(handler = () => []) {
  const calls = [];
  const run = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  run.calls = calls;
  return run;
}

const dept = { id: DEPT, name: "Web", slug: "web", tenant_id: TENANT };
const headProfile = {
  id: HEAD,
  role: "dept_lead",
  vertical: "technical",
  memberships: [{ department_id: DEPT, level: "dept_lead", slug: "web" }]
};

function request(body, method = "PATCH") {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function load(path, { profile, sql }) {
  const audit = [];
  const notes = [];
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: profile.id },
      profile,
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async (entry) => { audit.push(entry); },
    notify: async (entry) => { notes.push(entry); }
  }));
  const mod = await import(path);
  return { audit, notes, mod };
}

function rosterSql({ existing = null, elevated = 0, role = "student" } = {}) {
  return recorder((text, values) => {
    if (text.startsWith("SELECT * FROM departments")) {
      return values[0] === DEPT ? [dept] : [];
    }
    if (text.startsWith("SELECT id, name, slug FROM departments")) {
      return values[0] === DEPT ? [dept] : [];
    }
    if (text.startsWith("SELECT * FROM profiles WHERE user_id")) {
      return [{ user_id: TARGET, name: "Member B", role, tenant_id: TENANT }];
    }
    if (text.startsWith("SELECT role FROM profiles")) {
      return [{ role }];
    }
    if (text.startsWith("SELECT * FROM department_memberships")) {
      return existing ? [{ user_id: TARGET, department_id: DEPT, level: existing }] : [];
    }
    if (text.startsWith("SELECT 1 AS present")) {
      return elevated ? [{ present: 1 }] : [];
    }
    if (text.startsWith("INSERT INTO department_memberships")) {
      return [{ user_id: TARGET, department_id: DEPT, level: values[2] }];
    }
    return [];
  });
}

describe("department roster route", () => {
  it("lets a head promote a member of their own department", async () => {
    const sql = rosterSql({ role: "student" });
    const { mod } = await load("@/app/api/departments/[id]/members/[userId]/route", {
      profile: headProfile, sql
    });
    const res = await mod.PATCH(request({ level: "core" }), { params: Promise.resolve({ id: DEPT, userId: TARGET }) });
    expect(res.status).toBe(200);
    expect(sql.calls.some((c) => c.text.includes("SET role = ?") || c.text.includes("SET role = core"))).toBe(true);
  });

  it("refuses to appoint a Head", async () => {
    const { mod } = await load("@/app/api/departments/[id]/members/[userId]/route", {
      profile: headProfile, sql: rosterSql()
    });
    const res = await mod.PATCH(request({ level: "dept_lead" }), { params: Promise.resolve({ id: DEPT, userId: TARGET }) });
    expect(res.status).toBe(403);
  });

  it("refuses to edit an existing Head's seat", async () => {
    const { mod } = await load("@/app/api/departments/[id]/members/[userId]/route", {
      profile: headProfile, sql: rosterSql({ existing: "dept_lead" })
    });
    const res = await mod.PATCH(request({ level: "core" }), { params: Promise.resolve({ id: DEPT, userId: TARGET }) });
    expect(res.status).toBe(403);
  });

  it("cannot reach another department's roster", async () => {
    const { mod } = await load("@/app/api/departments/[id]/members/[userId]/route", {
      profile: headProfile, sql: rosterSql()
    });
    const res = await mod.PATCH(request({ level: "core" }), { params: Promise.resolve({ id: OTHER, userId: TARGET }) });
    expect(res.status).toBe(404);
  });

  it("demotes a Core member only when no other elevated seat remains", async () => {
    const kept = rosterSql({ existing: "core", elevated: 1, role: "core" });
    const { mod: keptMod } = await load("@/app/api/departments/[id]/members/[userId]/route", {
      profile: headProfile, sql: kept
    });
    await keptMod.PATCH(request({ level: "general" }), { params: Promise.resolve({ id: DEPT, userId: TARGET }) });
    expect(kept.calls.some((c) => c.text.includes("'student'"))).toBe(false);

    const dropped = rosterSql({ existing: "core", elevated: 0, role: "core" });
    const { mod: droppedMod } = await load("@/app/api/departments/[id]/members/[userId]/route", {
      profile: headProfile, sql: dropped
    });
    await droppedMod.PATCH(request({ level: "general" }), { params: Promise.resolve({ id: DEPT, userId: TARGET }) });
    expect(dropped.calls.some((c) => c.text.includes("'student'"))).toBe(true);
  });

  it("removes a General member but never a Head", async () => {
    const general = rosterSql({ existing: "general", role: "student" });
    const { mod, notes } = await load("@/app/api/departments/[id]/members/[userId]/route", {
      profile: headProfile, sql: general
    });
    const removed = await mod.DELETE(request(null, "DELETE"), { params: Promise.resolve({ id: DEPT, userId: TARGET }) });
    expect(removed.status).toBe(200);
    expect(general.calls.some((c) => c.text.startsWith("DELETE FROM department_memberships"))).toBe(true);
    expect(notes).toHaveLength(1);

    const { mod: guarded } = await load("@/app/api/departments/[id]/members/[userId]/route", {
      profile: headProfile, sql: rosterSql({ existing: "dept_lead" })
    });
    const blocked = await guarded.DELETE(request(null, "DELETE"), { params: Promise.resolve({ id: DEPT, userId: TARGET }) });
    expect(blocked.status).toBe(403);
  });
});

function taskSql(task) {
  return recorder((text, values) => {
    if (text.includes("FROM department_tasks t")) return [task];
    if (text.startsWith("UPDATE department_tasks")) {
      return [{ ...task, status: task.status === "submitted" ? "done" : task.status }];
    }
    if (text.startsWith("SELECT id, name, slug FROM departments")) {
      return values[0] === DEPT ? [dept] : [];
    }
    return [];
  });
}

const baseTask = {
  id: TASK,
  department_id: DEPT,
  title: "Build the landing page",
  detail: "",
  kind: "task",
  priority: "medium",
  status: "assigned",
  assignee_id: TARGET,
  due_at: null,
  submitted_at: null,
  submitted_by: null,
  evidence_url: null,
  completion_note: null,
  reviewed_at: null,
  reviewed_by: null,
  review_note: null,
  created_by: HEAD,
  is_active: true,
  assignee_name: "Member B",
  reviewer_name: null
};

const coreProfile = {
  id: TARGET,
  role: "core",
  vertical: "technical",
  memberships: [{ department_id: DEPT, level: "core", slug: "web" }]
};

async function patchTask(task, body, profile) {
  const sql = taskSql(task);
  const { mod, audit } = await load("@/app/api/departments/[id]/tasks/[taskId]/route", { profile, sql });
  const res = await mod.PATCH(request(body), { params: Promise.resolve({ id: DEPT, taskId: TASK }) });
  const json = await res.json();
  return { res, json, sql, audit };
}

describe("department task route", () => {
  it("refuses to approve your own submission", async () => {
    const task = { ...baseTask, status: "submitted", submitted_by: HEAD };
    const { res, json } = await patchTask(task, { action: "approve" }, headProfile);
    expect(res.status).toBe(403);
    expect(json.error.message).toMatch(/cannot be approved/);
  });

  it("lets the co-head approve the other head's submission and audits it", async () => {
    const task = { ...baseTask, status: "submitted", submitted_by: TARGET };
    const { res, json, audit } = await patchTask(task, { action: "approve", reviewNote: "Looks right" }, headProfile);
    expect(res.status).toBe(200);
    expect(json.data.task.status).toBe("done");
    expect(audit[0].action).toBe("department_task.approve");
    expect(audit[0].after.status).toBe("done");
  });

  it("requires evidence before a submission is accepted", async () => {
    const task = { ...baseTask, assignee_id: TARGET, status: "in_progress" };
    const { res, json } = await patchTask(task, { action: "submit" }, coreProfile);
    expect(res.status).toBe(400);
    expect(json.error.message).toMatch(/evidence/i);
  });

  it("refuses a move by someone the work is not assigned to", async () => {
    const task = { ...baseTask, assignee_id: "someone-else" };
    const { res } = await patchTask(task, { action: "start" }, coreProfile);
    expect(res.status).toBe(403);
  });

  it("refuses a return without a reason", async () => {
    const task = { ...baseTask, status: "submitted", submitted_by: TARGET };
    const { res, json } = await patchTask(task, { action: "return" }, headProfile);
    expect(res.status).toBe(400);
    expect(json.error.message).toMatch(/needs to change/i);
  });
});
