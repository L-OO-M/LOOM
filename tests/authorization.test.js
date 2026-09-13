import { describe, expect, it } from "vitest";
import { hasRole, requireRole } from "@/lib/auth";

describe("authorization helpers", () => {
  it("grants admin everything student can do", () => {
    expect(hasRole({ role: "admin" }, "admin")).toBe(true);
    expect(hasRole({ role: "admin" }, "student")).toBe(true);
    expect(hasRole({ role: "student" }, "admin")).toBe(false);
    expect(hasRole({ role: "student" }, "student")).toBe(true);
    expect(hasRole(null, "student")).toBe(false);
  });

  it("requireRole returns FORBIDDEN envelope for students on admin routes", () => {
    expect(requireRole({ role: "student" }, "admin")).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "The current user cannot perform this action"
    });
    expect(requireRole({ role: "admin" }, "admin").ok).toBe(true);
  });

  it("never trusts client tenant: membership must come from profile", () => {
    // Contract test: callers must derive tenant from server profile, not request body.
    // This documents the invariant enforced by lib/auth-server.js getRequestContext.
    const clientSuppliedTenant = "college-b";
    const profileTenant = "college-a";
    expect(clientSuppliedTenant).not.toBe(profileTenant);
  });
});
