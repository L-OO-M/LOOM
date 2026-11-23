import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitMemory } from "@/lib/rate-limit";

// The closure route is the one place a member can end their own account, so the
// boundaries pinned here are the ones that matter: the typed phrase, the admin
// handover guard, and the fact that identity is erased while the ledger row
// survives.

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "member-a";

function recorder(handler = () => []) {
  const calls = [];
  const run = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  run.calls = calls;
  run.begin = async (fn) => fn(run);
  return run;
}

function request(body) {
  return new Request("http://localhost/api/account/close", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function load({ profile = { role: "student", memberships: [] }, error = null, sql } = {}) {
  const audit = [];
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => (
      error
        ? { error, user: { id: USER }, profile: null, tenant: null, sql }
        : { error: null, user: { id: USER }, profile, tenant: { id: TENANT }, sql }
    ),
    writeAudit: async (entry) => { audit.push(entry); }
  }));
  const mod = await import("@/app/api/account/close/route");
  return { mod, audit };
}

beforeEach(() => {
  __resetRateLimitMemory();
});

describe("POST /api/account/close", () => {
  it("refuses a phrase that is not the exact confirmation", async () => {
    const sql = recorder();
    const { mod } = await load({ sql });
    const res = await mod.POST(request({ confirm: "close account" }));
    expect(res.status).toBe(400);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses an admin until the seat is handed over", async () => {
    const sql = recorder();
    const { mod } = await load({ profile: { role: "admin", memberships: [] }, sql });
    const res = await mod.POST(request({ confirm: "CLOSE MY ACCOUNT" }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error.code).toBe("ADMIN_HANDOVER_REQUIRED");
    expect(sql.calls).toHaveLength(0);
  });

  it("closes the account and erases identity inside one transaction", async () => {
    const sql = recorder();
    const { mod, audit } = await load({
      profile: { role: "core", memberships: [{ department_id: "d1", level: "core" }] },
      sql
    });
    const res = await mod.POST(request({ confirm: " close my account ", reason: "Moving cities" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.closed).toBe(true);

    const profileUpdate = sql.calls.find((c) => c.text.startsWith("UPDATE profiles"));
    expect(profileUpdate.text).toContain("account_status = 'deactivated'");
    expect(profileUpdate.text).toContain("name = 'Former member'");
    expect(profileUpdate.text).toContain("closed_at = NOW()");
    expect(profileUpdate.text).toContain("vertical = NULL");

    expect(sql.calls.some((c) => c.text.startsWith("DELETE FROM user_profiles"))).toBe(true);
    expect(sql.calls.some((c) => c.text.startsWith("DELETE FROM github_connections"))).toBe(true);
    expect(sql.calls.some((c) => c.text.startsWith("DELETE FROM department_memberships"))).toBe(true);
    expect(sql.calls.some((c) => c.text.startsWith("DELETE FROM mentors"))).toBe(true);
    expect(sql.calls.some((c) => c.text.startsWith("UPDATE role_requests"))).toBe(true);
    expect(sql.calls.some((c) => c.text.startsWith("DELETE FROM notifications"))).toBe(true);

    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("account.closed");
    expect(audit[0].after.reason).toBe("Moving cities");
    expect(audit[0].after.self_service).toBe(true);
  });

  it("reports an already-closed account instead of writing again", async () => {
    const sql = recorder();
    const { mod } = await load({ error: "ACCOUNT_DEACTIVATED", sql });
    const res = await mod.POST(request({ confirm: "CLOSE MY ACCOUNT" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ALREADY_CLOSED");
    expect(sql.calls).toHaveLength(0);
  });

  it("requires a session", async () => {
    const sql = recorder();
    const { mod } = await load({ error: "UNAUTHORIZED", sql });
    const res = await mod.POST(request({ confirm: "CLOSE MY ACCOUNT" }));
    expect(res.status).toBe(401);
  });
});
