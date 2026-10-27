import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "student-1";
const THREAD = "22222222-2222-4222-8222-222222222222";
const REPLY = "33333333-3333-4333-8333-333333333333";

function jsonRequest(body) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function recorder(handler = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  sql.calls = calls;
  return sql;
}

async function loadWithAuth(path, ctx) {
  vi.resetModules();
  const audit = [];
  const notices = [];
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ctx,
    writeAudit: async (args) => audit.push(args),
    notify: async (args) => notices.push(args)
  }));
  const route = await import(path);
  return { route, audit, notices };
}

describe("community flags", () => {
  beforeEach(() => vi.resetModules());

  it("does not insert a flag for a thread in another tenant", async () => {
    const sql = recorder(() => []);
    const { route, audit } = await loadWithAuth("@/app/api/community/flags/route", {
      user: { id: USER },
      profile: { role: "student" },
      tenant: { id: TENANT },
      sql
    });

    const response = await route.POST(jsonRequest({
      targetType: "thread",
      targetId: THREAD,
      reason: "spam"
    }));

    expect(response.status).toBe(404);
    expect(sql.calls.some((c) => c.text.includes("INSERT INTO forum_flags"))).toBe(false);
    expect(audit).toHaveLength(0);
  });

  it("validates a reply through its thread and updates by reply id alone", async () => {
    const sql = recorder((text) => {
      if (text.includes("FROM forum_replies r")) return [{ id: REPLY }];
      if (text.includes("INSERT INTO forum_flags")) return [{ id: "flag-1" }];
      return [];
    });
    const { route, audit } = await loadWithAuth("@/app/api/community/flags/route", {
      user: { id: USER },
      profile: { role: "student" },
      tenant: { id: TENANT },
      sql
    });

    const response = await route.POST(jsonRequest({
      targetType: "reply",
      targetId: REPLY,
      reason: "abuse"
    }));

    expect(response.status).toBe(200);
    const validation = sql.calls.find((c) => c.text.includes("FROM forum_replies r"));
    expect(validation.text).toContain("JOIN forum_threads t");
    expect(validation.text).toContain("t.tenant_id =");
    expect(validation.values).toContain(TENANT);
    const update = sql.calls.find((c) => c.text.includes("UPDATE forum_replies"));
    expect(update.text).toBe("UPDATE forum_replies SET flag_count = flag_count + 1 WHERE id = ?");
    expect(audit[0].resourceId).toBe(REPLY);
  });
});

describe("help match GET", () => {
  beforeEach(() => vi.resetModules());

  it("requires the caller to be the signal owner or helper", async () => {
    const sql = recorder(() => [{ id: "match-1" }]);
    vi.doMock("@/lib/requirePermission", () => ({
      requireCan: async () => ({ user: { id: USER }, profile: { role: "student" }, tenant: { id: TENANT }, sql }),
      toGuardResponse: () => null
    }));
    const { GET } = await import("@/app/api/help/matches/[id]/route");

    const response = await GET(new Request("http://localhost"), { params: { id: "match-1" } });

    expect(response.status).toBe(200);
    const query = sql.calls[0];
    expect(query.text).toContain("JOIN help_signals s");
    expect(query.text).toContain("s.user_id = ?");
    expect(query.text).toContain("m.helper_id = ?");
    expect(query.values).toContain(USER);
  });

  it("returns 404 when the match is not the caller's", async () => {
    const sql = recorder(() => []);
    vi.doMock("@/lib/requirePermission", () => ({
      requireCan: async () => ({ user: { id: USER }, profile: { role: "student" }, tenant: { id: TENANT }, sql }),
      toGuardResponse: () => null
    }));
    const { GET } = await import("@/app/api/help/matches/[id]/route");

    const response = await GET(new Request("http://localhost"), { params: { id: "match-1" } });

    expect(response.status).toBe(404);
  });
});

describe("contributions tenant scope", () => {
  beforeEach(() => vi.resetModules());

  it("scopes both the department lookup and the ledger query to the caller tenant", async () => {
    const sql = recorder((text) => {
      if (text.includes("FROM departments")) return [{ vertical: "technical" }];
      return [];
    });
    const { route } = await loadWithAuth("@/app/api/contributions/route", {
      user: { id: "admin-1" },
      profile: { role: "admin", vertical: null, memberships: [] },
      tenant: { id: TENANT },
      sql
    });

    const response = await route.GET(new Request(
      `http://localhost/api/contributions?studentId=other&departmentId=${THREAD}`
    ));

    expect(response.status).toBe(200);
    for (const call of sql.calls.filter((c) => c.text.includes("FROM departments") || c.text.includes("FROM member_contributions"))) {
      expect(call.text).toContain("tenant_id = ?::uuid");
      expect(call.text).not.toContain("IS NULL");
      expect(call.values).toContain(TENANT);
    }
  });
});

describe("email verification token consumption", () => {
  beforeEach(() => vi.resetModules());

  function db({ consumed = null, existing = null } = {}) {
    const calls = [];
    const tx = (strings, ...values) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push(text);
      if (text.startsWith("UPDATE email_verification_tokens")) return Promise.resolve(consumed);
      if (text.startsWith("SELECT used_at")) return Promise.resolve(existing);
      return Promise.resolve([]);
    };
    const sql = () => Promise.resolve([]);
    sql.begin = (fn) => fn(tx);
    sql.calls = calls;
    return sql;
  }

  it("consumes and verifies atomically in one transaction", async () => {
    const sql = db({ consumed: [{ user_id: "u1", email: "a@b.com" }] });
    const { consumeVerificationToken } = await import("@/lib/email-verification");

    const result = await consumeVerificationToken({ sql, raw: "a".repeat(64) });

    expect(result).toEqual({ ok: true, userId: "u1", email: "a@b.com" });
    expect(sql.calls[0]).toContain("used_at IS NULL");
    expect(sql.calls[0]).toContain("expires_at > NOW()");
    expect(sql.calls[1]).toContain("UPDATE profiles");
  });

  it("rejects an already-used token without updating the profile", async () => {
    const sql = db({ consumed: [], existing: [{ used_at: "2026-01-01", expires_at: "2027-01-01" }] });
    const { consumeVerificationToken } = await import("@/lib/email-verification");

    const result = await consumeVerificationToken({ sql, raw: "a".repeat(64) });

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(sql.calls.some((c) => c.includes("UPDATE profiles"))).toBe(false);
  });

  it("reports expiry separately from an invalid token", async () => {
    const sql = db({ consumed: [], existing: [{ used_at: null, expires_at: "2020-01-01" }] });
    const { consumeVerificationToken } = await import("@/lib/email-verification");

    const result = await consumeVerificationToken({ sql, raw: "a".repeat(64) });

    expect(result).toEqual({ ok: false, reason: "expired" });
  });
});
