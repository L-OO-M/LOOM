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

async function load({ sql, tenant = { id: TENANT } }) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "admin-1" },
      profile: { role: "admin" },
      tenant,
      sql
    }),
    writeAudit: async () => {}
  }));
  const { GET, POST } = await import("@/app/api/admin/contests/route");
  return { GET, POST };
}

function request(body) {
  return new Request("http://localhost/api/admin/contests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("admin contest scope", () => {
  beforeEach(() => vi.resetModules());

  it("lists contests in the admin's exact tenant", async () => {
    const sql = recorder(() => []);
    const { GET } = await load({ sql });

    const response = await GET();

    expect(response.status).toBe(200);
    const query = sql.calls[0];
    expect(query.text).toContain("c.tenant_id = ?::uuid");
    expect(query.text).not.toContain("IS NULL");
  });

  it("fails closed without a chapter", async () => {
    const sql = recorder();
    const { GET, POST } = await load({ sql, tenant: null });

    expect((await GET()).status).toBe(403);
    expect((await POST(request({ title: "Hack night" }))).status).toBe(403);
    expect(sql.calls).toHaveLength(0);
  });

  it("creates the contest inside the admin's tenant", async () => {
    const sql = recorder((text) =>
      text.startsWith("INSERT INTO contests")
        ? [{ id: "contest-1", tenant_id: TENANT, title: "Hack night" }]
        : []
    );
    const { POST } = await load({ sql });

    const response = await POST(request({ title: "Hack night", status: "draft" }));

    expect(response.status).toBe(201);
    const insert = sql.calls.find((c) => c.text.startsWith("INSERT INTO contests"));
    expect(insert.values[0]).toBe(TENANT);
  });
});
