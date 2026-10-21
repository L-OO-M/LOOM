import { describe, expect, it } from "vitest";
import { handoverScope, UUID_PATTERN, ROLE_LABELS } from "@/lib/handover";

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
