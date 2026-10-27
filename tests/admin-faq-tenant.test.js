import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const FAQ_ID = "22222222-2222-4222-8222-222222222222";

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
  return import("@/app/api/admin/faq/route");
}

function request(method, body) {
  return new Request("http://localhost/api/admin/faq", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("admin FAQ scope", () => {
  beforeEach(() => vi.resetModules());

  it("lists only the admin's chapter", async () => {
    const sql = recorder();
    const { GET } = await load({ sql });

    expect((await GET()).status).toBe(200);
    expect(sql.calls[0].text).toContain("tenant_id = ?::uuid");
    expect(sql.calls[0].text).not.toContain("IS NULL");
  });

  it("fails closed without a chapter", async () => {
    const sql = recorder();
    const { GET, POST, PATCH } = await load({ sql, tenant: null });

    expect((await GET()).status).toBe(403);
    expect((await POST(request("POST", { question: "What is LOOM?", answer: "A chapter." }))).status).toBe(403);
    expect((await PATCH(request("PATCH", { id: FAQ_ID, question: "Changed question" }))).status).toBe(403);
    expect(sql.calls).toHaveLength(0);
  });

  it("writes new FAQs into the admin's chapter", async () => {
    const sql = recorder((text) =>
      text.startsWith("INSERT INTO faqs") ? [{ id: FAQ_ID, tenant_id: TENANT }] : []
    );
    const { POST } = await load({ sql });

    const response = await POST(request("POST", {
      question: "What is LOOM?",
      answer: "A chapter for builders."
    }));

    expect(response.status).toBe(201);
    expect(sql.calls.find((c) => c.text.startsWith("INSERT INTO faqs")).values[0]).toBe(TENANT);
  });

  it("will not update an FAQ outside the admin's chapter", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM faqs")) return [{ id: FAQ_ID, question: "Other chapter" }];
      return [];
    });
    const { PATCH } = await load({ sql });

    const response = await PATCH(request("PATCH", { id: FAQ_ID, question: "Changed question" }));

    expect(response.status).toBe(404);
    const lookup = sql.calls.find((c) => c.text.startsWith("SELECT * FROM faqs"));
    expect(lookup.text).toContain("tenant_id = ?::uuid");
    expect(lookup.text).not.toContain("IS NULL");
  });

  it("keeps the tenant predicate on the update itself", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT * FROM faqs")) return [{ id: FAQ_ID, question: "Old question" }];
      if (text.startsWith("UPDATE faqs")) return [{ id: FAQ_ID, question: "New question" }];
      return [];
    });
    const { PATCH } = await load({ sql });

    const response = await PATCH(request("PATCH", { id: FAQ_ID, question: "New question" }));

    expect(response.status).toBe(200);
    const update = sql.calls.find((c) => c.text.startsWith("UPDATE faqs"));
    expect(update.text).toContain("tenant_id = ?::uuid");
  });
});
