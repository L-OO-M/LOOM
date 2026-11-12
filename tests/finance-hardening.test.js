import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const HEAD = "22222222-2222-4222-8222-222222222222";
const DEPT_A = "33333333-3333-4333-8333-333333333333";
const DEPT_B = "44444444-4444-4444-8444-444444444444";

function recorder(handler = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  sql.calls = calls;
  sql.begin = async (fn) => fn(sql);
  return sql;
}

function req(url, method, body) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function loadExpenses({ sql, profile }) {
  vi.resetModules();
  const audits = [];
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "lead-1" },
      profile,
      tenant: { id: TENANT },
      sql
    }),
    writeAudit: async (args) => { audits.push(args); }
  }));
  const mod = await import("@/app/api/finance/expenses/route");
  return { ...mod, audits };
}

describe("finance expense scope", () => {
  beforeEach(() => vi.resetModules());

  it("refuses a department lead charging a head that belongs to another department", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT id, vertical, department_id FROM budget_heads")) {
        return [{ id: HEAD, vertical: "technical", department_id: DEPT_A }];
      }
      if (text.startsWith("SELECT id, vertical FROM departments")) {
        return [{ id: DEPT_B, vertical: "technical" }];
      }
      return [];
    });
    const { POST } = await loadExpenses({
      sql,
      profile: { role: "core", memberships: [{ department_id: DEPT_A, level: "dept_lead" }] }
    });

    const res = await POST(req("http://localhost/api/finance/expenses", "POST", {
      headId: HEAD,
      departmentId: DEPT_B,
      amount: 500,
      note: "Venue deposit"
    }));

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/different department/i);
  });

  it("accepts a department lead charging a head their department owns", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("SELECT id, vertical, department_id FROM budget_heads")) {
        return [{ id: HEAD, vertical: null, department_id: DEPT_A }];
      }
      if (text.startsWith("INSERT INTO expenses")) {
        return [{ id: "expense-1", status: "proposed" }];
      }
      return [];
    });
    const { POST } = await loadExpenses({
      sql,
      profile: { role: "core", memberships: [{ department_id: DEPT_A, level: "dept_lead" }] }
    });

    const res = await POST(req("http://localhost/api/finance/expenses", "POST", {
      headId: HEAD,
      amount: 500,
      note: "Venue deposit"
    }));

    expect(res.status).toBe(201);
  });

  it("moves an approved expense to paid with who moved it", async () => {
    const sql = recorder((text) => {
      if (text.startsWith("UPDATE expenses") && text.includes("status = 'paid'")) {
        return [{ id: "expense-1", status: "paid", paid_by: "admin-1" }];
      }
      return [];
    });
    const { PATCH, audits } = await loadExpenses({
      sql,
      profile: { role: "admin", memberships: [] }
    });

    const res = await PATCH(req("http://localhost/api/finance/expenses", "PATCH", {
      id: "55555555-5555-4555-8555-555555555555",
      decision: "paid"
    }));

    expect(res.status).toBe(200);
    expect((await res.json()).data.expense.status).toBe("paid");
    expect(audits[0]).toMatchObject({ action: "expense_paid", resource: "expense" });
  });
});

describe("sponsorship scope", () => {
  beforeEach(() => vi.resetModules());

  it("refuses a vertical lead moving a sponsorship outside their vertical", async () => {
    const sql = recorder();
    vi.resetModules();
    vi.doMock("@/lib/auth-server", () => ({
      getRequestContext: async () => ({
        user: { id: "vl-1" },
        profile: { role: "vertical_lead", vertical: "technical", memberships: [] },
        tenant: { id: TENANT },
        sql
      }),
      writeAudit: async () => {}
    }));
    const { PUT } = await import("@/app/api/finance/sponsorships/route");

    const res = await PUT(req("http://localhost/api/finance/sponsorships", "PUT", {
      id: "66666666-6666-4666-8666-666666666666",
      status: "received",
      vertical: "non_technical"
    }));

    expect(res.status).toBe(403);
  });
});
