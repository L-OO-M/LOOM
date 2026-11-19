import { describe, expect, it } from "vitest";
import {
  ACCOUNT_STATUSES,
  CHECKLIST_KINDS,
  PEOPLE_ROLES,
  canDeactivate,
  checklistProgress,
  normalizePeopleRole,
  statusLabel
} from "@/lib/people";

// People-ops vocabulary is shared by API validation, admin UI and the export.
// checklistProgress() is covered in people-ops.test.js; this file pins the
// smaller predicates and the role/status allowlists those callers rely on.

describe("vocabulary", () => {
  it("keeps the role ladder in one place", () => {
    expect(PEOPLE_ROLES).toEqual(["student", "core", "dept_lead", "vertical_lead", "admin"]);
  });

  it("has exactly the two checklist kinds", () => {
    expect(CHECKLIST_KINDS).toEqual(["onboarding", "offboarding"]);
  });

  it("has exactly the three account statuses", () => {
    expect(ACCOUNT_STATUSES).toEqual(["active", "suspended", "deactivated"]);
  });
});

describe("normalizePeopleRole", () => {
  it("passes known roles through", () => {
    for (const role of PEOPLE_ROLES) expect(normalizePeopleRole(role)).toBe(role);
  });

  it("downgrades unknown or missing roles to student", () => {
    for (const role of ["platform_admin", "ghost", "", null, undefined, 42]) {
      expect(normalizePeopleRole(role)).toBe("student");
    }
  });
});

describe("statusLabel", () => {
  it("labels the three statuses", () => {
    expect(statusLabel("active")).toBe("Active");
    expect(statusLabel("suspended")).toBe("Suspended");
    expect(statusLabel("deactivated")).toBe("Deactivated");
  });

  it("defaults anything else to Active", () => {
    expect(statusLabel(undefined)).toBe("Active");
    expect(statusLabel("weird")).toBe("Active");
  });
});

describe("canDeactivate", () => {
  it("allows deactivation when nothing is outstanding", () => {
    expect(canDeactivate({ outstanding: [] })).toBe(true);
    expect(canDeactivate(null)).toBe(true);
    expect(canDeactivate(undefined)).toBe(true);
  });

  it("blocks deactivation while a checklist item is open", () => {
    expect(canDeactivate({ outstanding: [{ key: "handover_filed" }] })).toBe(false);
  });

  it("agrees with checklistProgress for an empty and a complete checklist", () => {
    const empty = checklistProgress([], "admin", "offboarding");
    expect(empty.outstanding.length).toBeGreaterThan(0);
    expect(canDeactivate(empty)).toBe(false);

    const complete = checklistProgress(
      empty.items.map((item) => ({ item_key: item.key, done: true, kind: "offboarding" })),
      "admin",
      "offboarding"
    );
    expect(complete.pct).toBe(100);
    expect(canDeactivate(complete)).toBe(true);
  });
});
