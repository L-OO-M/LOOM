import { describe, expect, it } from "vitest";
import {
  COOLDOWN_DAYS,
  REQUIREMENTS,
  TARGET_ROLES,
  evaluateRoleRequest,
  proofTotal,
  roleRank
} from "@/lib/role-requests";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 22);
const fullProof = { nodes: 2, projects: 1, oss: 1, answers: 1 };

describe("role-request policy", () => {
  it("offers exactly the two seats a member can ask for", () => {
    expect(TARGET_ROLES).toEqual(["core", "dept_lead"]);
    expect(REQUIREMENTS.core.minProof).toBe(3);
    expect(REQUIREMENTS.dept_lead.minProof).toBe(5);
  });

  it("ranks roles in the same order as the permission matrix", () => {
    expect(roleRank("student")).toBe(0);
    expect(roleRank("core")).toBe(1);
    expect(roleRank("dept_lead")).toBe(2);
    expect(roleRank("admin")).toBe(4);
    expect(roleRank("nonsense")).toBe(0);
  });

  it("totals proof across every verified kind", () => {
    expect(proofTotal({ nodes: 2, projects: 1, oss: 1, answers: 1 })).toBe(5);
    expect(proofTotal({ nodes: "2", projects: null })).toBe(2);
    expect(proofTotal()).toBe(0);
  });

  it("lets a member with rank and proof ask for Core", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "core",
      role: "student",
      tier: "intermediate",
      proof: fullProof,
      now: NOW
    });
    expect(verdict.eligible).toBe(true);
    expect(verdict.reasons).toEqual([]);
    expect(verdict.proof.total).toBe(5);
  });

  it("refuses Core to a beginner with nothing verified", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "core",
      tier: "beginner",
      proof: { nodes: 1 },
      now: NOW
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.map((r) => r.code)).toEqual(["RANK_TOO_LOW", "NOT_ENOUGH_PROOF"]);
  });

  it("counts the shortfall in the message so the member knows what to do", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "core",
      tier: "intermediate",
      proof: { nodes: 1, projects: 1 },
      now: NOW
    });
    const short = verdict.reasons.find((r) => r.code === "NOT_ENOUGH_PROOF");
    expect(short.message).toContain("needs 3");
    expect(short.message).toContain("You have 2");
  });

  it("does not let a Core member ask for Core again", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "core",
      role: "core",
      tier: "advanced",
      proof: fullProof,
      now: NOW
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons[0].code).toBe("ALREADY_AT_ROLE");
  });

  it("requires the department for a Head seat", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "dept_lead",
      tier: "advanced",
      proof: fullProof,
      departmentMember: false,
      now: NOW
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.map((r) => r.code)).toEqual(["NOT_IN_DEPARTMENT"]);
  });

  it("lets an Advanced member of the department ask for the Head seat", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "dept_lead",
      role: "core",
      tier: "advanced",
      proof: fullProof,
      departmentMember: true,
      now: NOW
    });
    expect(verdict.eligible).toBe(true);
  });

  it("allows one open request at a time", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "core",
      tier: "advanced",
      proof: fullProof,
      openRequest: true,
      now: NOW
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.map((r) => r.code)).toEqual(["OPEN_REQUEST_EXISTS"]);
  });

  it("holds a cooldown after a decision and names the date it lifts", () => {
    const decided = new Date(NOW - 3 * DAY).toISOString();
    const verdict = evaluateRoleRequest({
      targetRole: "core",
      tier: "advanced",
      proof: fullProof,
      lastDecisionAt: decided,
      lastDecisionStatus: "rejected",
      now: NOW
    });
    expect(verdict.eligible).toBe(false);
    const cooldown = verdict.reasons.find((r) => r.code === "COOLDOWN");
    expect(cooldown.message).toContain("rejected");
    expect(cooldown.message).toContain(new Date(NOW - 3 * DAY + COOLDOWN_DAYS * DAY).toISOString().slice(0, 10));
  });

  it("lifts the cooldown once it has run", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "core",
      tier: "advanced",
      proof: fullProof,
      lastDecisionAt: new Date(NOW - (COOLDOWN_DAYS + 1) * DAY).toISOString(),
      now: NOW
    });
    expect(verdict.eligible).toBe(true);
  });

  it("ignores an unparseable decision date instead of blocking forever", () => {
    const verdict = evaluateRoleRequest({
      targetRole: "core",
      tier: "advanced",
      proof: fullProof,
      lastDecisionAt: "not a date",
      now: NOW
    });
    expect(verdict.eligible).toBe(true);
  });

  it("makes both seats department-scoped", () => {
    // Core is stored on the membership row, and a Head seat runs one
    // department, so neither can be requested in the abstract.
    expect(REQUIREMENTS.core.requiresDepartment).toBe(true);
    expect(REQUIREMENTS.dept_lead.requiresDepartment).toBe(true);
    // Core only requires you to *pick* a department -- joining is instant.
    expect(REQUIREMENTS.core.needsDepartment).toBe(false);
    expect(REQUIREMENTS.dept_lead.needsDepartment).toBe(true);
  });

  it("rejects a seat that does not exist", () => {    const verdict = evaluateRoleRequest({ targetRole: "admin", tier: "advanced", proof: fullProof, now: NOW });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons[0].code).toBe("UNKNOWN_TARGET");
  });
});
