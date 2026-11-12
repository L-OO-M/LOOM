import { afterEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ADMIN = "99999999-9999-4999-8999-999999999999";
const TARGET = "22222222-2222-4222-8222-222222222222";

function makeDb() {
  const state = { statements: [], inserted: false, rows: [] };
  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.statements.push(text);
    if (text === "NOW()") return "NOW()";
    if (/SELECT user_id, name, role FROM profiles/.test(text)) {
      return [{ user_id: TARGET, name: "Asha", role: "dept_lead" }];
    }
    if (/INSERT INTO people_checklist_items/.test(text)) {
      state.inserted = true;
      state.rows = [{ kind: "offboarding", item_key: "handover_filed", done: true }];
      return [];
    }
    if (/FROM people_checklist_items/.test(text)) return state.rows;
    throw new Error(`unexpected query: ${text}`);
  }
  return { sql: (strings, ...values) => Promise.resolve(dispatch(strings, values)), state };
}

const contexts = [];

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => contexts.shift(),
    writeAudit: async () => {}
  }));
  return import("@/app/api/admin/students/[id]/checklist/route");
}

async function patch(body, db) {
  contexts.push({ user: { id: ADMIN }, tenant: { id: TENANT }, sql: db.sql });
  const { PATCH } = await loadRoute();
  return PATCH(new Request("http://localhost/api/admin/students/x/checklist", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }), { params: Promise.resolve({ id: TARGET }) });
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  contexts.length = 0;
});

describe("PATCH /api/admin/students/[id]/checklist", () => {
  it("rejects an item that is not part of the target role's template", async () => {
    const db = makeDb();
    const res = await patch({ kind: "offboarding", itemKey: "made_up", done: true }, db);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("UNKNOWN_ITEM");
    expect(db.state.inserted).toBe(false);
  });

  it("upserts completion and returns the refreshed checklist", async () => {
    const db = makeDb();
    const res = await patch({ kind: "offboarding", itemKey: "handover_filed", done: true }, db);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(db.state.inserted).toBe(true);
    expect(body.data.checklist.done).toBe(1);
    expect(body.data.checklist.items.find((i) => i.key === "handover_filed").done).toBe(true);
  });
});
