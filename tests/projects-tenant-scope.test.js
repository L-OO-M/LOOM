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

async function load({ tenant = { id: TENANT }, sql, role = "admin" }) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "user-1" },
      profile: { role },
      tenant,
      sql
    }),
    writeAudit: async () => {}
  }));
  const { GET, POST } = await import("@/app/api/projects/route");
  return { GET, POST };
}

describe("project tenant scope", () => {
  beforeEach(() => vi.resetModules());

  it("scopes the admin project list to one exact tenant", async () => {
    const sql = recorder(() => []);
    const { GET } = await load({ sql });

    const response = await GET();

    expect(response.status).toBe(200);
    const query = sql.calls.find((c) => c.text.includes("FROM projects"));
    expect(query.text).toContain("tenant_id = ?::uuid");
    expect(query.text).not.toContain("IS NULL");
    expect(query.values).toContain(TENANT);
  });

  it("fails closed instead of listing every chapter when tenant is missing", async () => {
    const sql = recorder();
    const { GET } = await load({ sql, tenant: null });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses project creation without a chapter context", async () => {
    const sql = recorder();
    const { POST } = await load({ sql, tenant: null });

    const response = await POST(new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Project", repoUrl: "https://github.com/a/b" })
    }));

    expect(response.status).toBe(403);
    expect(sql.calls).toHaveLength(0);
  });
});
