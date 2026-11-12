import { afterEach, describe, expect, it, vi } from "vitest";

// #41: projects gained a team, milestones, and a deliberate submit-for-review
// step. These tests exercise the guards that make the new surfaces safe:
// tenant scoping, owner/maintainer permissions, and the state the submit route
// is allowed to enter.

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";

const contexts = [];
const audits = [];
const notifications = [];

function makeDb(rows) {
  const statements = [];
  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ text, values });
    for (const [pattern, handler] of rows) {
      if (pattern.test(text)) return handler(values);
    }
    return [];
  }
  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.statements = statements;
  return sql;
}

async function loadRoute(modulePath) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => contexts.shift(),
    writeAudit: async (args) => { audits.push(args); },
    notify: async (args) => { notifications.push(args); }
  }));
  return import(modulePath);
}

function project(overrides = {}) {
  return {
    id: PROJECT,
    tenant_id: TENANT,
    owner_id: OWNER,
    title: "Loom",
    status: "active",
    evidence_state: "provisional",
    repo_url: "https://github.com/owner/loom",
    ...overrides
  };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  contexts.length = 0;
  audits.length = 0;
  notifications.length = 0;
});

describe("project team and milestones", () => {
  it("lets the owner add a same-chapter collaborator", async () => {
    const sql = makeDb([
      [/FROM projects/, () => [project()]],
      [/FROM profiles/, () => [{ user_id: MEMBER, name: "Ravi" }]],
      [/INSERT INTO project_members/, (v) => [{ id: "m1", project_id: PROJECT, user_id: v[2], role: v[3] }]]
    ]);
    contexts.push({ user: { id: OWNER }, profile: { role: "student" }, tenant: { id: TENANT }, sql });

    const { POST } = await loadRoute("@/app/api/projects/[id]/team/route");
    const response = await POST(
      new Request(`http://localhost/api/projects/${PROJECT}/team`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: MEMBER, role: "member" })
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.member.user_id).toBe(MEMBER);
    expect(notifications[0]).toMatchObject({ userId: MEMBER, type: "project_team" });
  });

  it("refuses a collaborator from another chapter", async () => {
    const sql = makeDb([
      [/FROM projects/, () => [project()]],
      [/FROM profiles/, () => []]
    ]);
    contexts.push({ user: { id: OWNER }, profile: { role: "student" }, tenant: { id: TENANT }, sql });

    const { POST } = await loadRoute("@/app/api/projects/[id]/team/route");
    const response = await POST(
      new Request(`http://localhost/api/projects/${PROJECT}/team`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: MEMBER })
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    );

    expect(response.status).toBe(404);
    expect(sql.statements.some((s) => /INSERT INTO project_members/.test(s.text))).toBe(false);
  });

  it("does not let a plain member edit milestones", async () => {
    const sql = makeDb([
      [/FROM projects/, () => [project()]],
      [/FROM project_members/, () => []]
    ]);
    contexts.push({ user: { id: MEMBER }, profile: { role: "student" }, tenant: { id: TENANT }, sql });

    const { PATCH } = await loadRoute("@/app/api/projects/[id]/milestones/route");
    const response = await PATCH(
      new Request(`http://localhost/api/projects/${PROJECT}/milestones`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ milestoneId: "55555555-5555-4555-8555-555555555555", status: "done" })
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    );

    expect(response.status).toBe(403);
  });

  it("marks a milestone done and returns the updated row", async () => {
    const milestoneId = "55555555-5555-4555-8555-555555555555";
    const sql = makeDb([
      [/FROM projects/, () => [project()]],
      [/UPDATE project_milestones/, () => [{ id: milestoneId, status: "done" }]]
    ]);
    contexts.push({ user: { id: OWNER }, profile: { role: "student" }, tenant: { id: TENANT }, sql });

    const { PATCH } = await loadRoute("@/app/api/projects/[id]/milestones/route");
    const response = await PATCH(
      new Request(`http://localhost/api/projects/${PROJECT}/milestones`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ milestoneId, status: "done" })
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.milestone.status).toBe("done");
  });
});

describe("submit for review", () => {
  it("moves a project with a repo into review and notifies admins", async () => {
    const sql = makeDb([
      [/FROM projects/, () => [project()]],
      [/UPDATE projects/, () => [project({ status: "in_review" })]],
      [/FROM profiles/, () => [{ user_id: MEMBER }]]
    ]);
    contexts.push({ user: { id: OWNER }, profile: { role: "student", name: "Asha" }, tenant: { id: TENANT }, sql });

    const { POST } = await loadRoute("@/app/api/projects/[id]/submit/route");
    const response = await POST(
      new Request(`http://localhost/api/projects/${PROJECT}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Tests are in /tests" })
      }),
      { params: Promise.resolve({ id: PROJECT }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.project.status).toBe("in_review");
    expect(notifications[0]).toMatchObject({ userId: MEMBER, type: "project_review" });
  });

  it("refuses submission without a repository", async () => {
    const sql = makeDb([[/FROM projects/, () => [project({ repo_url: null })]]]);
    contexts.push({ user: { id: OWNER }, profile: { role: "student" }, tenant: { id: TENANT }, sql });

    const { POST } = await loadRoute("@/app/api/projects/[id]/submit/route");
    const response = await POST(
      new Request(`http://localhost/api/projects/${PROJECT}/submit`, { method: "POST" }),
      { params: Promise.resolve({ id: PROJECT }) }
    );

    expect(response.status).toBe(409);
    expect(sql.statements.some((s) => /UPDATE projects/.test(s.text))).toBe(false);
  });
});
