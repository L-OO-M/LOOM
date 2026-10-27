import { afterEach, describe, expect, it, vi } from "vitest";

const USER = "user-founder";

// Build a fake postgres.js client: a callable tagged-template function plus
// begin(). The transaction client records statements and can be configured to
// lose the first-claim race or fail the profile write.
function makeDb({ mine = false, profile = null, win = true, failProfile = false } = {}) {
  const statements = [];
  let commits = 0;
  let rollbacks = 0;

  const makeQuery = (kind) => {
    const q = (strings, ...values) => {
      const text = strings.join("?");
      statements.push({ text, values, kind });

      if (/pg_advisory_xact_lock\(741852963\)/.test(text)) {
        return Promise.resolve([]);
      }
      if (/SELECT user_id FROM platform_admins/.test(text)) {
        return Promise.resolve(mine ? [{ user_id: values[0] }] : []);
      }
      if (/SELECT tenant_id FROM profiles/.test(text)) {
        return Promise.resolve(profile ? [profile] : []);
      }
      if (/INSERT INTO platform_admins/.test(text)) {
        return Promise.resolve(win ? [{ user_id: values[0] }] : []);
      }
      if (/UPDATE profiles/.test(text) || /INSERT INTO profiles/.test(text)) {
        if (failProfile) return Promise.reject(new Error("profile write failed"));
        return Promise.resolve([]);
      }
      throw new Error(`unexpected query: ${text}`);
    };
    q.kind = kind;
    return q;
  };

  const tx = makeQuery("tx");
  const sql = makeQuery("root");
  sql.begin = async (fn) => {
    try {
      const result = await fn(tx);
      commits += 1;
      return result;
    } catch (error) {
      rollbacks += 1;
      throw error;
    }
  };
  sql.stats = () => ({ commits, rollbacks });
  sql.statements = statements;
  return sql;
}

async function loadRoute({ db, identity, audits }) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ getSql: () => db }));
  vi.doMock("@/lib/auth-server", () => ({
    getSessionIdentity: async () => identity,
    writeAudit: async (args) => { audits.push(args); }
  }));
  return import("@/app/api/admin/claim-first/route");
}

function expectLockFirst(db) {
  expect(db.statements[0].text).toBe("SELECT pg_advisory_xact_lock(741852963)");
  expect(db.statements[0].kind).toBe("tx");
}

function post(body) {
  return new Request("http://localhost/api/admin/claim-first", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

afterEach(() => {
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/auth-server");
});

describe("POST /api/admin/claim-first transaction", () => {
  it("writes the platform admin and existing profile in one transaction", async () => {
    const db = makeDb({ profile: { tenant_id: "tenant-1" } });
    const audits = [];
    const identity = { userId: USER, email: "founder@example.com" };
    const { POST } = await loadRoute({ db, identity, audits });

    const response = await POST(post({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, data: { message: "Admin claimed" } });
    expect(db.stats()).toEqual({ commits: 1, rollbacks: 0 });
    expect(db.statements.every((s) => s.kind === "tx")).toBe(true);
    expectLockFirst(db);

    const adminIndex = db.statements.findIndex((s) => /INSERT INTO platform_admins/.test(s.text));
    const profileIndex = db.statements.findIndex((s) => /UPDATE profiles SET role = 'admin'/.test(s.text));
    expect(adminIndex).toBeGreaterThanOrEqual(0);
    expect(profileIndex).toBeGreaterThan(adminIndex);

    expect(audits).toHaveLength(1);
    expect(audits[0].sql.kind).toBe("tx");
    expect(audits[0].action).toBe("admin.claim_first");
    expect(audits[0].tenantId).toBe("tenant-1");
    expect(audits[0].after).toBeUndefined();
  });

  it("creates a missing profile inside the same transaction using the email fallback", async () => {
    const db = makeDb({ profile: null });
    const audits = [];
    const identity = { userId: USER, email: null };
    const { POST } = await loadRoute({ db, identity, audits });

    const response = await POST(post({ email: "newadmin@example.com" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.message).toBe("Admin claimed");
    expect(db.stats()).toEqual({ commits: 1, rollbacks: 0 });

    const insertProfile = db.statements.find((s) => /INSERT INTO profiles/.test(s.text));
    expect(insertProfile).toBeDefined();
    expect(insertProfile.kind).toBe("tx");
    expect(insertProfile.values).toEqual([USER, "newadmin"]);
    expect(insertProfile.text).toContain("'admin', 'web'");
    expect(audits).toHaveLength(1);
    expect(audits[0].sql.kind).toBe("tx");
    expect(audits[0].tenantId).toBeNull();
  });

  it("rolls back and returns 403 ALREADY_SETUP when the first-claim insert loses the race", async () => {
    const db = makeDb({ win: false });
    const audits = [];
    const identity = { userId: USER, email: "founder@example.com" };
    const { POST } = await loadRoute({ db, identity, audits });

    const response = await POST(post({}));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("ALREADY_SETUP");
    expect(db.stats()).toEqual({ commits: 0, rollbacks: 1 });
    expectLockFirst(db);
    expect(db.statements.some((s) => /profiles/.test(s.text) && /UPDATE|INSERT/.test(s.text))).toBe(false);
    expect(audits).toHaveLength(0);
  });

  it("rejects and rolls back the platform_admins insert when the profile write fails", async () => {
    const db = makeDb({ profile: { tenant_id: "tenant-1" }, failProfile: true });
    const audits = [];
    const identity = { userId: USER, email: "founder@example.com" };
    const { POST } = await loadRoute({ db, identity, audits });

    await expect(POST(post({}))).rejects.toThrow("profile write failed");

    expect(db.stats()).toEqual({ commits: 0, rollbacks: 1 });
    expectLockFirst(db);
    expect(db.statements.some((s) => /INSERT INTO platform_admins/.test(s.text))).toBe(true);
    expect(db.statements.some((s) => /UPDATE profiles/.test(s.text))).toBe(true);
    expect(audits).toHaveLength(0);
  });

  it("is idempotent for an existing admin without mutating the profile again", async () => {
    const db = makeDb({ mine: true, profile: { tenant_id: "tenant-1" } });
    const audits = [];
    const identity = { userId: USER, email: "founder@example.com" };
    const { POST } = await loadRoute({ db, identity, audits });

    const response = await POST(post({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.message).toBe("Admin already claimed");
    expect(db.stats()).toEqual({ commits: 1, rollbacks: 0 });
    expectLockFirst(db);
    expect(db.statements.some((s) => /INSERT INTO platform_admins/.test(s.text))).toBe(false);
    expect(db.statements.some((s) => /UPDATE profiles|INSERT INTO profiles/.test(s.text))).toBe(false);

    expect(audits).toHaveLength(1);
    expect(audits[0].sql.kind).toBe("tx");
    expect(audits[0].after).toEqual({ repeat: true });
  });

  it("rejects a body userId that does not match the session before touching the database", async () => {
    const db = makeDb();
    const audits = [];
    const identity = { userId: USER, email: "founder@example.com" };
    const { POST } = await loadRoute({ db, identity, audits });

    const response = await POST(post({ userId: "someone-else" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(db.statements).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});
