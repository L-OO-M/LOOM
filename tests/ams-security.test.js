import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  can,
  hasActiveScopedGrant,
  hasVerticalLeadGrant
} from "@/lib/permissions";
import { approvalRequirement } from "@/lib/approvals";
import { evidenceDedupeHash } from "@/lib/ranking";

const activeGrant = (overrides = {}) => ({
  tenant_id: "tenant-a",
  role_name: "vertical_lead",
  scope_type: "vertical",
  scope_id: "technical",
  is_active: true,
  starts_at: "2026-01-01T00:00:00.000Z",
  expires_at: "2027-01-01T00:00:00.000Z",
  revoked_at: null,
  ...overrides
});

describe("AMS scoped authorization invariants", () => {
  it("rejects expired, future, revoked and cross-tenant grants", () => {
    const base = { id: "lead", tenantId: "tenant-a" };
    expect(hasVerticalLeadGrant({ ...base, scopedGrants: [activeGrant()] }, "technical")).toBe(true);
    expect(hasVerticalLeadGrant({ ...base, scopedGrants: [activeGrant({ expires_at: "2026-01-02T00:00:00.000Z" })] }, "technical")).toBe(false);
    expect(hasVerticalLeadGrant({ ...base, scopedGrants: [activeGrant({ starts_at: "2027-01-01T00:00:00.000Z" })] }, "technical")).toBe(false);
    expect(hasVerticalLeadGrant({ ...base, scopedGrants: [activeGrant({ revoked_at: "2026-06-01T00:00:00.000Z", is_active: false })] }, "technical")).toBe(false);
    expect(hasVerticalLeadGrant({ ...base, scopedGrants: [activeGrant({ tenant_id: "tenant-b" })] }, "technical")).toBe(false);
  });

  it("bounds event door staff to the exact event", () => {
    const user = {
      id: "door",
      tenantId: "tenant-a",
      role: "core",
      memberships: [],
      scopedGrants: [activeGrant({
        role_name: "event_door_staff",
        scope_type: "event",
        scope_id: "event-a"
      })]
    };
    expect(hasActiveScopedGrant(user, "event_door_staff", "event", "event-a")).toBe(true);
    expect(can(user, "check_in_attendees", { eventId: "event-a" }).ok).toBe(true);
    expect(can(user, "check_in_attendees", { eventId: "event-b" }).ok).toBe(false);
  });

  it("keeps separation of duties above admin rank", () => {
    const admin = { id: "admin", role: "admin", memberships: [] };
    expect(can(admin, "verify_department_work", { contributors: ["admin"] })).toMatchObject({
      ok: false,
      reason: "cannot_approve_own_submission"
    });
    expect(can(admin, "approve_budget", { proposerId: "admin" })).toMatchObject({
      ok: false,
      reason: "cannot_approve_own_budget"
    });
    expect(ACTIONS).toContain("platform_break_glass");
    expect(can(admin, "platform_break_glass").ok).toBe(false);
    expect(can({ ...admin, isPlatformBreakGlass: true }, "platform_break_glass").ok).toBe(true);
  });
});

describe("AMS database security migrations", () => {
  const integrity = fs.readFileSync("load/migrations/096_ams_integrity_followup.sql", "utf8");
  const governance = fs.readFileSync("load/migrations/097_approval_workflow_audit.sql", "utf8");

  it("enforces tenant membership and validates grant resource scope", () => {
    expect(integrity).toMatch(/FOREIGN KEY \(tenant_id, user_id\)/);
    expect(integrity).toMatch(/validate_scoped_role_grant_scope/);
    expect(integrity).toMatch(/department scope is outside grant tenant/);
    expect(integrity).toMatch(/event scope is outside grant tenant/);
  });

  it("forces tenant RLS and makes governance histories append-only", () => {
    for (const table of ["scoped_role_grants", "event_status_history", "tenant_keyrings"]) {
      expect(integrity).toContain(`'${table}'`);
    }
    expect(integrity).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(governance).toMatch(/prevent_governance_history_mutation/);
    expect(governance).toMatch(/audit_logs.*event_status_history.*approval_decisions/s);
  });

  it("allows audit retention only through the guarded private function", () => {
    const scheduler = fs.readFileSync("lib/scheduler.js", "utf8");
    expect(governance).toMatch(/CREATE SCHEMA IF NOT EXISTS loom_private/);
    expect(governance).toMatch(/SECURITY DEFINER/);
    expect(governance).toMatch(/cutoff > pg_catalog\.now\(\) - interval '365 days'/);
    expect(governance).toMatch(/REVOKE DELETE ON public\.audit_logs FROM loom_app/);
    expect(governance).toMatch(/REVOKE ALL ON FUNCTION loom_private\.prune_audit_logs_before/);
    expect(scheduler).toContain("loom_private.prune_audit_logs_before");
    expect(scheduler).not.toContain("DELETE FROM public.audit_logs");
  });
});

describe("AMS evidence and approval policies", () => {
  it("uses milestone-specific hashes instead of kind/ref uniqueness", () => {
    const base = {
      tenantId: "tenant-a",
      userId: "member-a",
      kind: "project_verified",
      refId: "project-a",
      source: "review"
    };
    const first = evidenceDedupeHash({ ...base, evidence: { milestoneId: "m1" } });
    const duplicate = evidenceDedupeHash({ ...base, evidence: { milestoneId: "m1" } });
    const second = evidenceDedupeHash({ ...base, evidence: { milestoneId: "m2" } });
    expect(first).toBe(duplicate);
    expect(second).not.toBe(first);
  });

  it("requires two independent approvals at the configured aggregate threshold", () => {
    const settings = {
      dual_head_approval: {
        require_dual_on_budget: true,
        budget_threshold: 10_000,
        escalation_hours: 48,
        independent_escalation_role: "admin"
      }
    };
    expect(approvalRequirement(settings, { resourceType: "expense", amount: 9_999 }).requiredApprovals).toBe(1);
    expect(approvalRequirement(settings, { resourceType: "expense", amount: 10_000 })).toMatchObject({
      requiredApprovals: 2,
      escalationHours: 48
    });
  });
});
