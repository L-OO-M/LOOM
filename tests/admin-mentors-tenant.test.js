import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";

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

async function loadRoute(path, { sql, tenant = { id: TENANT } }) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "admin-1" },
      profile: { role: "admin" },
      tenant,
      sql
    }),
    writeAudit: async () => {},
    notify: async () => {}
  }));
  return import(path);
}

function request(path, body) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("admin mentor scope", () => {
  beforeEach(() => vi.resetModules());

  it("lists mentors and sessions only for the admin's chapter", async () => {
    const sql = recorder(() => []);
    const { GET } = await loadRoute("@/app/api/admin/mentors/route", { sql });

    expect((await GET()).status).toBe(200);

    expect(sql.calls).toHaveLength(2);
    for (const call of sql.calls) {
      expect(call.text).toContain("m.tenant_id = ?::uuid");
      expect(call.text).not.toContain("IS NULL");
    }
  });

  it("fails closed without a chapter", async () => {
    const sql = recorder();
    const { GET, POST } = await loadRoute("@/app/api/admin/mentors/route", { sql, tenant: null });

    expect((await GET()).status).toBe(403);
    expect((await POST(request("/api/admin/mentors", { userId: "student-1" }))).status).toBe(403);
    expect(sql.calls).toHaveLength(0);
  });

  it("checks a new mentor against the admin's exact chapter", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT user_id FROM profiles")) return [{ user_id: "student-1" }];
      if (text.startsWith("INSERT INTO mentors")) return [{ id: "mentor-1" }];
      return [];
    });
    const { POST } = await loadRoute("@/app/api/admin/mentors/route", { sql });

    expect((await POST(request("/api/admin/mentors", { userId: "student-1" }))).status).toBe(201);

    const target = sql.calls.find((c) => c.text.startsWith("SELECT user_id FROM profiles"));
    expect(target.text).toContain("tenant_id = ?::uuid");
    expect(target.text).not.toContain("IS NULL");
  });

  it("lists mentor applications only for the admin's chapter", async () => {
    const sql = recorder(() => []);
    const { GET } = await loadRoute("@/app/api/admin/mentor-applications/route", { sql });

    expect((await GET()).status).toBe(200);
    expect(sql.calls[0].text).toContain("a.tenant_id = ?::uuid");
    expect(sql.calls[0].text).not.toContain("IS NULL");
  });

  it("passes the exact chapter into application review", async () => {
    const reviewApplication = vi.fn(async () => ({ student_id: "student-1" }));
    vi.doMock("@/lib/mentorship", () => ({ reviewApplication }));
    const sql = recorder();
    const { POST } = await loadRoute("@/app/api/admin/mentor-applications/route", { sql });

    const response = await POST(request("/api/admin/mentor-applications", {
      id: "22222222-2222-4222-8222-222222222222",
      decision: "approved"
    }));

    expect(response.status).toBe(200);
    expect(reviewApplication).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT }));
  });
});
