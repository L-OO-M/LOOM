import { describe, expect, it } from "vitest";
import {
  CLOSURE_PHRASE,
  ERASED_IDENTITY_FIELDS,
  closureBlockers,
  isClosurePhrase
} from "@/lib/account-closure";

describe("self-service account closure policy", () => {
  it("accepts the phrase regardless of case or surrounding spaces", () => {
    expect(isClosurePhrase(CLOSURE_PHRASE)).toBe(true);
    expect(isClosurePhrase(`  ${CLOSURE_PHRASE.toLowerCase()} `)).toBe(true);
    expect(isClosurePhrase("close account")).toBe(false);
    expect(isClosurePhrase("")).toBe(false);
    expect(isClosurePhrase(null)).toBe(false);
  });

  it("makes an admin hand over the seat first", () => {
    const blockers = closureBlockers({ role: "admin" });
    expect(blockers).toHaveLength(1);
    expect(blockers[0].code).toBe("ADMIN_HANDOVER_REQUIRED");
    expect(blockers[0].status).toBe(409);
  });

  it("treats a platform admin as an admin even without the chapter role", () => {
    expect(closureBlockers({ role: "student", isPlatformAdmin: true })[0].code)
      .toBe("ADMIN_HANDOVER_REQUIRED");
  });

  it("makes a live department head hand over the seat first", () => {
    const blockers = closureBlockers({
      role: "core",
      memberships: [{ department_id: "d1", level: "dept_lead", term_end: null }]
    });
    expect(blockers[0].code).toBe("LEADERSHIP_HANDOVER_REQUIRED");
  });

  it("lets a head whose term has ended close the account", () => {
    const blockers = closureBlockers({
      role: "student",
      memberships: [{ department_id: "d1", level: "dept_lead", term_end: "2020-01-01" }]
    });
    expect(blockers).toEqual([]);
  });

  it("lets an ordinary member close the account", () => {
    expect(closureBlockers({
      role: "core",
      memberships: [{ department_id: "d1", level: "core", term_end: null }]
    })).toEqual([]);
  });

  it("erases identity fields but never the ledger key or tenant", () => {
    expect(ERASED_IDENTITY_FIELDS).toContain("name");
    expect(ERASED_IDENTITY_FIELDS).toContain("github_username");
    expect(ERASED_IDENTITY_FIELDS).not.toContain("user_id");
    expect(ERASED_IDENTITY_FIELDS).not.toContain("tenant_id");
    expect(ERASED_IDENTITY_FIELDS).not.toContain("role");
  });
});
