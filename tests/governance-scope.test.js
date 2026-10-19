import { describe, expect, it } from "vitest";
import { canAccessVertical, ownedVerticals, canManageSocietyWide } from "@/lib/scope";

const admin = { id: "a", role: "admin", vertical: null, memberships: [] };
const technicalLead = { id: "v", role: "vertical_lead", vertical: "technical", memberships: [] };
const nonTechnicalLead = { id: "n", role: "vertical_lead", vertical: "non_technical", memberships: [] };
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
