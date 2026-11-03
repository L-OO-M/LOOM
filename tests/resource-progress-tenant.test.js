import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "33333333-3333-4333-8333-333333333333";
const USER = "student-1";

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

async function loadRoute({ tenant = { id: TENANT }, sql }) {
  vi.resetModules();
  vi.doMock("next/cache", () => ({ revalidateTag: () => {} }));
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: USER },
      profile: { role: "student" },
      tenant,
      sql
    }),
    writeAudit: async () => {}
  }));
  return import("@/app/api/resources/route");
}

describe("resource progress tenancy", () => {
  beforeEach(() => vi.resetModules());

  it("filters completed rows by the caller tenant", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT resource_id FROM resource_progress")) return [{ resource_id: "res-1" }];
      if (text.startsWith("SELECT * FROM resources")) return [{ id: "res-1" }];
      return [];
    });
    const { GET } = await loadRoute({ sql });

    const response = await GET(new Request("http://localhost/api/resources"));
    expect(response.status).toBe(200);

    const done = sql.calls.find((c) => c.text.startsWith("SELECT resource_id FROM resource_progress"));
    expect(done.text).toContain("tenant_id = ?::uuid");
    expect(done.values).toContain(TENANT);
  });

  it("writes the caller tenant and repairs a conflicting row", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT id, title FROM resources")) return [{ id: RESOURCE, title: "One" }];
      if (text.startsWith("INSERT INTO resource_progress")) return [{ id: "progress-1" }];
      return [];
    });
    const { POST } = await loadRoute({ sql });

    const response = await POST(new Request("http://localhost/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceId: RESOURCE })
    }));
    expect(response.status).toBe(200);

    const insert = sql.calls.find((c) => c.text.startsWith("INSERT INTO resource_progress"));
    expect(insert.text).toContain("tenant_id = EXCLUDED.tenant_id");
    expect(insert.values).toContain(TENANT);
  });

  it("rejects a non-uuid resource id before querying a uuid column", async () => {
    const sql = recorder();
    const { POST } = await loadRoute({ sql });

    const response = await POST(new Request("http://localhost/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceId: "not-a-uuid" })
    }));

    expect(response.status).toBe(400);
    expect(sql.calls).toHaveLength(0);
  });

  it("refuses to write progress without a resolved tenant", async () => {
    const sql = recorder();
    const { POST } = await loadRoute({ tenant: null, sql });

    const response = await POST(new Request("http://localhost/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceId: RESOURCE })
    }));

    expect(response.status).toBe(404);
    expect(sql.calls).toHaveLength(0);
  });
});
