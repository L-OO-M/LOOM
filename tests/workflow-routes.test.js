import { afterEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const WORKFLOW = "22222222-2222-4222-8222-222222222222";
const HANDOFF = "33333333-3333-4333-8333-333333333333";
const DEPARTMENT = "44444444-4444-4444-8444-444444444444";

function context(sql, profile = {}) {
  return {
    user: { id: "lead-1" },
    tenant: { id: TENANT },
    profile: {
      role: "dept_lead",
      vertical: "technical",
      memberships: [{
        department_id: DEPARTMENT,
        level: "dept_lead",
        slug: "web",
        vertical: "technical"
      }],
      scopedGrants: [],
      ...profile
    },
    sql
  };
}

async function loadRoute(path, ctx) {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ctx
  }));
  return import(path);
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
});

describe("workflow collection route", () => {
  it("builds a tenant- and authority-scoped workflow listing", async () => {
    const calls = [];
    const sql = (strings, ...values) => {
      calls.push({
        text: strings.join("?").replace(/\s+/g, " ").trim(),
        values
      });
      return Promise.resolve([]);
    };
    const { GET } = await loadRoute("@/app/api/workflows/route", context(sql));

    const response = await GET(new Request("http://localhost/api/workflows?status=active"));
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("WHERE wi.tenant_id = ?::uuid");
    expect(calls[0].text).toContain("wh.tenant_id = wi.tenant_id");
    expect(calls[0].text).toContain("wi.initiating_department_id = ANY(?::uuid[])");
    expect(calls[0].text).toContain("visible_handoff.tenant_id = wi.tenant_id");
    expect(calls[0].values).toContain(TENANT);
    expect(calls[0].values).toContainEqual([DEPARTMENT]);
  });

  it("rejects unknown statuses and unimplemented workflow types before querying", async () => {
    const sql = vi.fn();
    const { GET, POST } = await loadRoute("@/app/api/workflows/route", context(sql));

    const invalidStatus = await GET(new Request("http://localhost/api/workflows?status=surprise"));
    expect(invalidStatus.status).toBe(400);

    const unsupportedType = await POST(new Request("http://localhost/api/workflows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowType: "hackathon",
        title: "Chapter hackathon",
        initiatingDepartmentId: DEPARTMENT
      })
    }));
    expect(unsupportedType.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("workflow handoff route", () => {
  it("returns a conflict when another writer wins the status transition", async () => {
    const statements = [];
    const handoff = {
      id: HANDOFF,
      workflow_id: WORKFLOW,
      tenant_id: TENANT,
      to_department_id: DEPARTMENT,
      assigned_owner_id: null,
      submitted_by: "member-2",
      sequence: 2,
      status: "submitted",
      department_slug: "web",
      department_vertical: "technical"
    };
    const sql = (strings, ...values) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      statements.push({ text, values });
      if (text.startsWith("SELECT wh.*")) return Promise.resolve([handoff]);
      return Promise.resolve([]);
    };
    sql.begin = async (fn) => {
      const tx = (strings, ...values) => {
        const text = strings.join("?").replace(/\s+/g, " ").trim();
        statements.push({ text, values });
        return Promise.resolve([]);
      };
      tx.json = (value) => value;
      return fn(tx);
    };
    const { PATCH } = await loadRoute(
      "@/app/api/workflows/[id]/handoffs/[handoffId]/route",
      context(sql, { role: "admin", memberships: [] })
    );

    const response = await PATCH(new Request("http://localhost/api/workflows/test", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve", reviewNote: "Ready" })
    }), { params: Promise.resolve({ id: WORKFLOW, handoffId: HANDOFF }) });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("CONFLICT");
    const update = statements.find((statement) => statement.text.startsWith("UPDATE workflow_handoffs SET"));
    expect(update.text).toContain("AND tenant_id = ?::uuid AND status = ?");
    expect(update.values).toContain(TENANT);
    expect(update.values).toContain("submitted");
  });

  it("blocks self-review before beginning a transaction", async () => {
    const sql = vi.fn(async () => [{
      id: HANDOFF,
      workflow_id: WORKFLOW,
      tenant_id: TENANT,
      to_department_id: DEPARTMENT,
      assigned_owner_id: null,
      submitted_by: "lead-1",
      sequence: 1,
      status: "submitted",
      department_slug: "web",
      department_vertical: "technical"
    }]);
    sql.begin = vi.fn();
    const { PATCH } = await loadRoute(
      "@/app/api/workflows/[id]/handoffs/[handoffId]/route",
      context(sql)
    );

    const response = await PATCH(new Request("http://localhost/api/workflows/test", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" })
    }), { params: Promise.resolve({ id: WORKFLOW, handoffId: HANDOFF }) });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("SELF_APPROVAL_BLOCKED");
    expect(sql.begin).not.toHaveBeenCalled();
  });
});
