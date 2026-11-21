import { describe, expect, it } from "vitest";
import {
  approvalRequirement,
  createApprovalRequest,
  decideApproval,
  finalizeApprovalResource
} from "@/lib/approvals";

function recorder(handler = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  };
  sql.json = (value) => value;
  sql.begin = async (fn) => fn(sql);
  return { calls, sql };
}

describe("shared approvals", () => {
  it("fails safe to dual approval when tenant settings are absent", () => {
    expect(approvalRequirement(null, { resourceType: "expense", amount: 10_000 }).requiredApprovals)
      .toBe(2);
  });

  it("keeps the first request snapshot immutable across retries", async () => {
    const row = { id: "approval-1", status: "pending" };
    const { calls, sql } = recorder(() => [row]);
    await expect(createApprovalRequest({
      sql,
      tenantId: "11111111-1111-4111-8111-111111111111",
      policyKey: "expense.standard",
      resourceType: "expense",
      resourceId: "22222222-2222-4222-8222-222222222222",
      requestedBy: "member-1",
      snapshot: { amount: 100 }
    })).resolves.toEqual(row);
    expect(calls[0].text).toContain("ON CONFLICT");
    expect(calls[0].text).toContain("DO NOTHING");
    expect(calls[0].text).not.toContain("DO UPDATE SET request_snapshot");
  });

  it("requires an atomic domain finalizer", async () => {
    const { sql } = recorder();
    await expect(decideApproval({
      sql,
      tenantId: "11111111-1111-4111-8111-111111111111",
      requestId: "22222222-2222-4222-8222-222222222222",
      actorId: "admin-1",
      actorRole: "admin",
      decision: "approved"
    })).rejects.toThrow(/atomic resource finalizer/);
  });

  it("updates the exact expense version linked to the final decision", async () => {
    const { calls, sql } = recorder((text) => text.startsWith("UPDATE expenses")
      ? [{ id: "expense-1", status: "approved" }]
      : []);
    await finalizeApprovalResource(sql, {
      request: {
        id: "33333333-3333-4333-8333-333333333333",
        tenant_id: "11111111-1111-4111-8111-111111111111",
        resource_type: "expense",
        resource_id: "22222222-2222-4222-8222-222222222222",
        resource_version: 1
      },
      status: "approved",
      actorId: "admin-1"
    });
    expect(calls[0].text).toContain("AND request_version = ?");
    expect(calls[0].text).toContain("AND approval_request_id = ?");
  });
});
