import { describe, expect, it } from "vitest";
import { canAccessVertical, ownedVerticals, canManageSocietyWide } from "@/lib/scope";

const admin = { id: "a", role: "admin", vertical: null, memberships: [] };
const verticalLead = (id, vertical) => ({
  id,
  role: "vertical_lead",
  vertical,
  memberships: [],
  scopedGrants: [{
    role_name: "vertical_lead",
    scope_type: "vertical",
    scope_id: vertical,
    is_active: true,
    starts_at: null,
    expires_at: null
  }]
});
const technicalLead = verticalLead("v", "technical");
const nonTechnicalLead = verticalLead("n", "non_technical");
const head = {
  id: "h",
  role: "dept_lead",
  vertical: "technical",
  memberships: [{ department_id: "d1", level: "dept_lead", vertical: "technical" }]
};
const core = { id: "c", role: "core", vertical: null, memberships: [] };

describe("domain (vertical) scope for the lead section", () => {
  it("admins own every domain and society-wide records", () => {
    expect(ownedVerticals(admin).all).toBe(true);
    expect(canAccessVertical(admin, "technical")).toBe(true);
    expect(canAccessVertical(admin, "non_technical")).toBe(true);
    expect(canAccessVertical(admin, null)).toBe(true);
    expect(canManageSocietyWide(admin)).toBe(true);
  });

  it("a vertical lead is confined to their own vertical", () => {
    expect(canAccessVertical(technicalLead, "technical")).toBe(true);
    expect(canAccessVertical(technicalLead, "non_technical")).toBe(false);
    expect(canAccessVertical(nonTechnicalLead, "technical")).toBe(false);
    // Society-wide records stay admin-only.
    expect(canAccessVertical(technicalLead, null)).toBe(false);
    expect(canManageSocietyWide(technicalLead)).toBe(false);
  });

  it("a department head owns the vertical(s) their departments sit in", () => {
    expect([...ownedVerticals(head)]).toEqual(["technical"]);
    expect(canAccessVertical(head, "technical")).toBe(true);
    expect(canAccessVertical(head, "non_technical")).toBe(false);
    expect(canAccessVertical(head, null)).toBe(false);
  });

  it("does not turn unrelated or expired memberships into leadership scope", () => {
    const mixed = {
      ...head,
      memberships: [
        ...head.memberships,
        { department_id: "d2", level: "general", vertical: "non_technical" },
        { department_id: "d3", level: "dept_lead", vertical: "non_technical", term_end: "2020-01-01" }
      ]
    };
    expect([...ownedVerticals(mixed)]).toEqual(["technical"]);
    expect(canAccessVertical(mixed, "non_technical")).toBe(false);
  });

  it("core and students have no domain standing", () => {
    expect(ownedVerticals(core).size).toBe(0);
    expect(canAccessVertical(core, "technical")).toBe(false);
    expect(canAccessVertical(null, "technical")).toBe(false);
  });

  it("ignores malformed vertical values instead of widening scope", () => {
    const bad = { ...technicalLead, vertical: "everything" };
    expect([...ownedVerticals(bad)]).toEqual([]);
    expect(canAccessVertical(bad, "technical")).toBe(false);
  });
});
