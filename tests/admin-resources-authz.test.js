import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";

function request() {
  return new Request("http://localhost/api/admin/resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "A resource", domain: "web", level: "foundation" })
  });
}

async function load(role, sql) {
  vi.resetModules();
  vi.doMock("next/cache", () => ({ revalidateTag: () => {} }));
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "user-1" },
      profile: { role },
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async () => {}
  }));
  return import("@/app/api/admin/resources/route");
}

describe("global resource catalog authorization", () => {
  beforeEach(() => vi.resetModules());

  it("rejects a chapter admin before any write", async () => {
    const sql = vi.fn(async () => []);
    const { POST } = await load("admin", sql);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it("allows a platform admin", async () => {
    const sql = vi.fn(async () => [{ id: "res_1", title: "A resource" }]);
    const { POST } = await load("platform_admin", sql);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(sql).toHaveBeenCalled();
  });
});
