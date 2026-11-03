import { describe, expect, it } from "vitest";
import { handoverScope, applyHandoverTransfer, UUID_PATTERN, ROLE_LABELS } from "@/lib/handover";

const member = (role, extra = {}) => ({
  role,
  vertical: null,
  memberships: [],
  roleTermEnd: null,
  ...extra
});

describe("handover scope", () => {
  it("rejects students and core members", () => {
    expect(handoverScope(member("student")).error).toBeTruthy();
    expect(handoverScope(member("core")).error).toBeTruthy();
  });

  it("derives the department a head actually leads", () => {
    const scope = handoverScope(member("dept_lead", {
      memberships: [
        { department_id: "d1", level: "core", name: "AI / ML", vertical: "technical" },
        { department_id: "d2", level: "dept_lead", name: "Web", vertical: "technical" }
      ]
    }));
    expect(scope).toEqual({
      role: "dept_lead",
      departmentId: "d2",
      departmentName: "Web",
      vertical: "technical"
    });
  });

  it("refuses to hand over one of several led departments", () => {
    const scope = handoverScope(member("dept_lead", {
      memberships: [
        { department_id: "d1", level: "dept_lead", name: "AI / ML", vertical: "technical" },
        { department_id: "d2", level: "dept_lead", name: "Web", vertical: "technical" }
      ]
    }));
    expect(scope.error).toContain("more than one department");
  });

  it("keeps a vertical lead inside their own vertical", () => {
    expect(handoverScope(member("vertical_lead", { vertical: "non_technical" }))).toEqual({
      role: "vertical_lead",
      vertical: "non_technical"
    });
    expect(handoverScope(member("vertical_lead")).error).toContain("vertical is not set");
  });

  it("lets an admin hand over the admin seat", () => {
    expect(handoverScope(member("admin"))).toEqual({ role: "admin" });
  });

  it("does not let an expired term hand over a seat", () => {
    const scope = handoverScope(member("dept_lead", {
      roleTermEnd: "2020-01-01",
      memberships: [{ department_id: "d1", level: "dept_lead", name: "AI / ML", vertical: "technical" }]
    }));
    expect(scope.error).toBeTruthy();
  });

  it("recognises UUID account ids and labels every handover role", () => {
    expect(UUID_PATTERN.test("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(UUID_PATTERN.test("not-a-uuid")).toBe(false);
    expect(Object.keys(ROLE_LABELS)).toEqual(["dept_lead", "vertical_lead", "admin"]);
  });
});

describe("applyHandoverTransfer", () => {
  const TENANT = "22222222-2222-4222-8222-222222222222";

  function recordingTx(toUserId) {
    const statements = [];
    const tx = (strings, ...values) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      statements.push({ text, values });
      if (/^UPDATE profiles SET role = \?/.test(text)) {
        return Promise.resolve([{ user_id: toUserId, name: "Successor", role: "admin" }]);
      }
      return Promise.resolve([]);
    };
    return { tx, statements };
  }

  it("reassigns planner sessions by raw text id, never through ::uuid", async () => {
    // 058 converted planner_sessions.owner_user_id from uuid to text because
    // account keys are not always UUIDs. Casting the assignment back to uuid
    // throws for precisely those ids, aborting the whole transfer.
    const fromUserId = "auth0|66f1e2d3";
    const toUserId = "auth0|77a2f3e4";
    const { tx, statements } = recordingTx(toUserId);

    const result = await applyHandoverTransfer(tx, {
      tenantId: TENANT,
      actorId: "auth0|admin",
      handover: { from_user_id: fromUserId, to_user_id: toUserId, role: "admin", transfer_planner: true }
    });

    const planner = statements.find((s) => /^UPDATE planner_sessions/.test(s.text));
    expect(planner).toBeTruthy();
    expect(planner.text).not.toMatch(/owner_user_id(\s*=\s*\?)?::uuid/);
    expect(planner.values).toContain(fromUserId);
    expect(planner.values).toContain(toUserId);
    expect(result.planner).toBe(0);
  });
});
