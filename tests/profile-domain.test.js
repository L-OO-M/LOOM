import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "student-1";

function patchRequest(body) {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function load(sql) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: USER },
      profile: { role: "student" },
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async () => {}
  }));
  return import("@/app/api/profile/route");
}

describe("profile primary domain", () => {
  beforeEach(() => vi.resetModules());

  it("rejects a domain outside PRIMARY_DOMAINS before touching the database", async () => {
    const calls = [];
    const sql = (strings) => {
      calls.push(strings.join("?"));
      return Promise.resolve([]);
    };
    const { PATCH } = await load(sql);

    const response = await PATCH(patchRequest({ primaryDomain: "astrology" }));

    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("accepts a real primary domain", async () => {
    const calls = [];
    const sql = (strings) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push(text);
      if (text.startsWith("SELECT")) return Promise.resolve([{ name: "Ada" }]);
      return Promise.resolve([{ name: "Ada", primary_domain: "ai_ml" }]);
    };
    const { PATCH } = await load(sql);

    const response = await PATCH(patchRequest({ primaryDomain: "ai_ml" }));

    expect(response.status).toBe(200);
    expect(calls.some((c) => c.includes("UPDATE profiles"))).toBe(true);
  });
});
