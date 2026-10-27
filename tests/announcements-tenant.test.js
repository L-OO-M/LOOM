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

async function load({ tenant = { id: TENANT }, sql }) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "user-1" },
      profile: { role: "student", vertical: null, memberships: [] },
      tenant,
      sql
    }),
    writeAudit: async () => {}
  }));
  return import("@/app/api/announcements/route");
}

describe("announcement tenant scope", () => {
  beforeEach(() => vi.resetModules());

  it("does not use a fail-open NULL tenant arm in the feed", async () => {
    const sql = recorder(() => []);
    const { GET } = await load({ sql });

    const response = await GET();

    expect(response.status).toBe(200);
    const feed = sql.calls.find((c) => c.text.includes("FROM announcements"));
    expect(feed.text).toContain("a.tenant_id = ?::uuid");
    expect(feed.text).not.toContain("IS NULL");
    expect(feed.values).toContain(TENANT);
  });

  it("refuses to post without a resolved tenant", async () => {
    const sql = recorder();
    const { POST } = await load({ tenant: null, sql });

    const response = await POST(new Request("http://localhost/api/announcements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "society", title: "Hello chapter" })
    }));

    expect(response.status).toBe(404);
    expect(sql.calls).toHaveLength(0);
  });
});
