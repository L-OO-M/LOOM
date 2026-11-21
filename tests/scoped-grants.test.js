import { describe, expect, it } from "vitest";
import { syncLeadershipScopedGrant } from "@/lib/scoped-grants";

function recorder() {
  const calls = [];
  const tx = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.startsWith("INSERT INTO scoped_role_grants")) {
      return Promise.resolve([{ id: "grant-1" }]);
    }
    return Promise.resolve([]);
  };
  return { calls, tx };
}

describe("leadership scoped-grant synchronization", () => {
  const base = {
    tenantId: "11111111-1111-4111-8111-111111111111",
    userId: "member-1",
    actorId: "admin-1",
    role: "dept_lead",
    departmentId: "22222222-2222-4222-8222-222222222222"
  };

  it("replaces only the same scoped appointment by default", async () => {
    const { calls, tx } = recorder();
    await syncLeadershipScopedGrant(tx, base);

    const revoke = calls.find((call) => call.text.startsWith("UPDATE scoped_role_grants"));
    expect(revoke.text).toContain("AND role_name = ?");
    expect(revoke.text).toContain("AND scope_type = ?");
    expect(revoke.text).toContain("AND scope_id = ?");
    expect(revoke.values).toEqual(expect.arrayContaining([
      "dept_lead",
      "department",
      base.departmentId
    ]));
  });

  it("revokes every leadership grant only when a global replacement says so", async () => {
    const { calls, tx } = recorder();
    await syncLeadershipScopedGrant(tx, { ...base, revokeAllLeadership: true });

    const revoke = calls.find((call) => call.text.startsWith("UPDATE scoped_role_grants"));
    expect(revoke.text).toContain("role_name IN ('vertical_lead', 'dept_lead', 'co_head')");
    expect(revoke.text).not.toContain("AND scope_id = ?");
  });

  it("removes all leadership authority when assigning a non-leadership role", async () => {
    const { calls, tx } = recorder();
    const created = await syncLeadershipScopedGrant(tx, { ...base, role: "core", departmentId: null });

    expect(created).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("role_name IN ('vertical_lead', 'dept_lead', 'co_head')");
  });
});
