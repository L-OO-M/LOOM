import { afterEach, describe, expect, it, vi } from "vitest";

// Bulk role assignment is a single transaction. These tests prove the cap is
// enforced before any query, that all writes share one begin(), and that a
// mid-batch failure leaves profiles untouched.
const TENANT = "11111111-1111-4111-8111-111111111111";
const ADMIN = "99999999-9999-4999-8999-999999999999";

function makeDb({ failOn = null, profiles = ["u1", "u2"] } = {}) {
  const state = {
    profiles: Object.fromEntries(profiles.map((id) => [id, { user_id: id, role: "student" }])),
    terms: [],
    begins: 0,
    statements: [],
    audits: 0,
    notifications: []
  };

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.statements.push(text);
    if (failOn && failOn.test(text)) throw new Error("injected bulk failure");

    if (/FROM platform_admins/.test(text)) return [];
    if (/COUNT\(\*\)::int AS admins/.test(text)) return [{ admins: 2 }];
    if (/COUNT\(\*\)::int AS c FROM profiles/.test(text)) return [{ c: 0 }];
    if (/SELECT user_id FROM profiles/.test(text)) {
      const ids = values.find((v) => Array.isArray(v)) || [];
      return ids.filter((id) => state.profiles[id]).map((id) => ({ user_id: id }));
    }
    if (/FROM departments/.test(text)) return [{ id: values[0], name: "Web Development" }];

    if (/UPDATE profiles SET role/.test(text)) {
      const ids = values.find((v) => Array.isArray(v)) || [];
      const role = values[0];
      for (const id of ids) {
        if (state.profiles[id]) state.profiles[id] = { ...state.profiles[id], role };
      }
      return ids.map((id) => ({ user_id: id }));
    }
    if (/UPDATE leadership_terms/.test(text)) {
      for (const term of state.terms) term.status = "ended";
      return [];
    }
    if (/INSERT INTO leadership_terms/.test(text)) {
      state.terms.push({ user_id: values[1], role: values[2], status: "active" });
      return [];
    }
    if (/UPDATE department_memberships/.test(text)) return [];
    if (/UPDATE departments/.test(text)) return [];
    if (/INSERT INTO department_memberships/.test(text)) return [];
    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.begin = async (fn) => {
    state.begins += 1;
    const snapshot = {
      profiles: structuredClone(state.profiles),
      terms: structuredClone(state.terms)
    };
    try {
      return await fn((strings, ...values) => Promise.resolve(dispatch(strings, values)));
    } catch (e) {
      state.profiles = snapshot.profiles;
      state.terms = snapshot.terms;
      throw e;
    }
  };
  return { sql, state };
}

const pendingContexts = [];

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => pendingContexts.shift(),
    writeAudit: async () => {},
    notify: async (args) => {
      const db = currentDb;
      if (db) db.state.notifications.push(args);
    }
  }));
  return import("@/app/api/admin/students/bulk/route");
}

let currentDb = null;

async function post(body, db = makeDb()) {
  currentDb = db;
  pendingContexts.push({ user: { id: ADMIN }, tenant: { id: TENANT }, sql: db.sql });
  const { POST } = await loadRoute();
  return POST(new Request("http://localhost/api/admin/students/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }));
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  pendingContexts.length = 0;
  currentDb = null;
});

describe("POST /api/admin/students/bulk", () => {
  it("rejects more than 500 users before any query", async () => {
    const db = makeDb();
    const response = await post({ userIds: Array.from({ length: 501 }, (_, i) => `u${i}`), role: "core" }, db);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("500");
    expect(db.state.statements).toHaveLength(0);
    expect(db.state.begins).toBe(0);
  });

  it("rejects an empty batch with a clear message", async () => {
    const db = makeDb();
    const response = await post({ userIds: [], role: "core" }, db);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toMatch(/at least one user/i);
    expect(db.state.begins).toBe(0);
  });

  it("writes every change in one transaction and reports the count", async () => {
    const db = makeDb({ profiles: ["u1", "u2"] });
    const response = await post({ userIds: ["u1", "u2"], role: "core" }, db);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.updated).toBe(2);
    expect(db.state.begins).toBe(1);
    expect(db.state.profiles.u1.role).toBe("core");
    expect(db.state.profiles.u2.role).toBe("core");
    expect(db.state.notifications).toHaveLength(2);
  });

  it("rolls back role writes when a later statement fails", async () => {
    const db = makeDb({ profiles: ["u1", "u2"], failOn: /UPDATE departments/ });
    await expect(post({ userIds: ["u1", "u2"], role: "core" }, db))
      .rejects.toThrow("injected bulk failure");

    expect(db.state.profiles.u1.role).toBe("student");
    expect(db.state.profiles.u2.role).toBe("student");
    expect(db.state.notifications).toHaveLength(0);
  });

  it("assigns department membership without changing any profile role", async () => {
    const db = makeDb({ profiles: ["u1", "u2"] });
    const response = await post({
      mode: "department",
      userIds: ["u1", "u2"],
      departmentId: "11111111-1111-4111-8111-111111111111",
      membershipLevel: "core",
      confirm: true
    }, db);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.updated).toBe(2);
    expect(body.data.level).toBe("core");
    expect(db.state.begins).toBe(1);
    expect(db.state.profiles.u1.role).toBe("student");
    expect(db.state.profiles.u2.role).toBe("student");
    expect(db.state.notifications).toHaveLength(2);
    expect(db.state.statements.some((s) => /INSERT INTO department_memberships/.test(s))).toBe(true);
  });
});
