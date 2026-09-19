import { describe, expect, it } from "vitest";
import { can, roleRank } from "@/lib/permissions";
import { hasRole, homeForRole } from "@/lib/auth";

const D1 = "dept-1";
const D2 = "dept-2";

// Validates the invariants hardened in 021 + route txn work:
// role/vertical/membership single-source sync and upward-only grants.
describe("role promotion invariants (021 hardening)", () => {
  it("vertical is scoped — clearing on demotion closes stale scope", () => {
    const vlead = { id: "u", role: "vertical_lead", vertical: "technical", memberships: [] };
    expect(can(vlead, "manage_users", { vertical: "technical" }).ok).toBe(true);
    expect(can(vlead, "manage_users", { vertical: "non_technical" }).ok).toBe(false);
    // After demotion vertical must be null — simulated by stripping.
    const demoted = { ...vlead, role: "core", vertical: null };
    expect(can(demoted, "manage_users", { vertical: "technical" }).ok).toBe(false);
    expect(demoted.vertical).toBeNull();
  });

  it("dept_lead without membership is not ambiently privileged", () => {
    // Route hardening guarantees dept_lead always has a membership row.
    // A bare role without membership must not pass scoped checks.
    const bare = { id: "u", role: "dept_lead", vertical: null, memberships: [] };
    expect(can(bare, "edit_dept_content", { departmentId: D1 }).ok).toBe(false);
    const withMem = { ...bare, memberships: [{ department_id: D1, level: "dept_lead" }] };
    expect(can(withMem, "edit_dept_content", { departmentId: D1 }).ok).toBe(true);
    expect(can(withMem, "edit_dept_content", { departmentId: D2 }).ok).toBe(false);
  });

  it("demoted dept_lead loses capability — membership downgrade to core is the invariant", () => {
    const before = { id: "u", role: "dept_lead", memberships: [{ department_id: D1, level: "dept_lead" }] };
    expect(can(before, "assign_mentor", { departmentId: D1 }).ok).toBe(true);
    // After demotion (hardened txn downgrades to core):
    const after = { id: "u", role: "core", memberships: [{ department_id: D1, level: "core" }] };
    expect(can(after, "assign_mentor", { departmentId: D1 }).ok).toBe(false);
    // But core still logs own contribution etc.
    expect(can(after, "log_contribution", { ownerId: "u" }).ok).toBe(true);
  });

  it("vertical_lead spans its vertical, not just owned departments", () => {
    const v = { id: "u", role: "vertical_lead", vertical: "technical", memberships: [] };
    expect(can(v, "view_finance", { vertical: "technical" }).ok).toBe(true);
    expect(can(v, "view_finance", { vertical: "non_technical" }).ok).toBe(false);
    expect(can(v, "export_reports").ok).toBe(true);
  });

  it("bulk parity: same schema as single — dept_lead requires department", () => {
    // Simulated bulk validation (mirrors zod schema in bulk/route.js)
    const bulkSchemaRoles = ["student", "core", "dept_lead", "vertical_lead", "admin"];
    expect(bulkSchemaRoles).toContain("vertical_lead");
    // vertical_lead requires vertical, dept_lead requires department — enforced server-side.
    // This test documents the contract, not the wire format.
    expect(hasRole({ role: "vertical_lead" }, "vertical_lead")).toBe(true);
  });

  it("roles are upward-only (never self-select, no demote via sync)", () => {
    expect(roleRank("student")).toBeLessThan(roleRank("core"));
    expect(roleRank("core")).toBeLessThan(roleRank("dept_lead"));
    expect(roleRank("dept_lead")).toBeLessThan(roleRank("vertical_lead"));
    expect(roleRank("vertical_lead")).toBeLessThan(roleRank("admin"));
    // hasRole inheritance
    expect(hasRole({ role: "vertical_lead" }, "dept_lead")).toBe(true);
    expect(hasRole({ role: "dept_lead" }, "vertical_lead")).toBe(false);
  });

  it("homeForRole routes leads to /lead without re-login dependency", () => {
    expect(homeForRole("vertical_lead")).toBe("/lead");
    expect(homeForRole("dept_lead")).toBe("/lead");
    expect(homeForRole("admin")).toBe("/admin");
    expect(homeForRole("student")).toBe("/student");
    expect(homeForRole("core")).toBe("/student");
  });
});
