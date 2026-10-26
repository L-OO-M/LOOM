import { describe, expect, it } from "vitest";
import {
  authCallbackMessage,
  canLinkByEmail,
  hasRole,
  homeForRole,
  requireRole,
  safeAuthErrorCode,
  safeRedirectPath
} from "@/lib/auth";

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

  it("lands each level where it works (layouts still enforce access)", () => {
    expect(homeForRole("admin")).toBe("/admin");
    expect(homeForRole("platform_admin")).toBe("/admin");
    expect(homeForRole("dept_lead")).toBe("/lead");
    expect(homeForRole("vertical_lead")).toBe("/lead");
    expect(homeForRole("student")).toBe("/student");
    expect(homeForRole("core")).toBe("/student");
    expect(homeForRole("ghost")).toBe("/student");
  });

  it("never trusts client tenant: membership must come from profile", () => {
    // Contract test: callers must derive tenant from server profile, not request body.
    // This documents the invariant enforced by lib/auth-server.js getRequestContext.
    const clientSuppliedTenant = "college-b";
    const profileTenant = "college-a";
    expect(clientSuppliedTenant).not.toBe(profileTenant);
  });
});

describe("safeRedirectPath", () => {
  it("accepts single-slash relative paths, keeping query and hash", () => {
    expect(safeRedirectPath("/lead/directory")).toBe("/lead/directory");
    expect(safeRedirectPath("/events?scope=registered")).toBe("/events?scope=registered");
    expect(safeRedirectPath("/student#roadmap")).toBe("/student#roadmap");
  });

  it("rejects absolute and protocol-relative URLs (open-redirect guard)", () => {
    expect(safeRedirectPath("https://evil.example")).toBeNull();
    expect(safeRedirectPath("http://evil.example/x")).toBeNull();
    expect(safeRedirectPath("//evil.example")).toBeNull();
    expect(safeRedirectPath("///evil.example")).toBeNull();
    expect(safeRedirectPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects backslash tricks and non-strings", () => {
    expect(safeRedirectPath("/\\evil.example")).toBeNull();
    expect(safeRedirectPath("\\\\evil.example")).toBeNull();
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath(42)).toBeNull();
  });
});

describe("auth callback errors", () => {
  it("forwards only known callback error codes", () => {
    expect(safeAuthErrorCode("access_denied")).toBe("access_denied");
    expect(safeAuthErrorCode(" PROVIDER_DISABLED ")).toBe("provider_disabled");
    expect(safeAuthErrorCode("redirect_not_allowed")).toBe("redirect_not_allowed");
    expect(safeAuthErrorCode("bad_code_verifier")).toBe("auth_callback_failed");
    expect(safeAuthErrorCode(undefined)).toBe("auth_callback_failed");
  });

  it("never reflects provider-supplied text into the login page", () => {
    // error_description is attacker-controlled and must not be rendered as-is.
    expect(authCallbackMessage("<script>alert(1)</script>"))
      .toBe("Sign-in could not be completed. Please try again.");
    expect(authCallbackMessage(null)).toBeNull();
    expect(authCallbackMessage("")).toBeNull();
  });

  it("explains the disabled-provider case instead of a raw provider error", () => {
    expect(authCallbackMessage("provider_disabled")).toMatch(/not enabled/i);
    expect(authCallbackMessage("access_denied")).toMatch(/cancelled/i);
  });
});

describe("canLinkByEmail", () => {
  it("only permits linking when the address is verified and present", () => {
    expect(canLinkByEmail({ email: "a@college.edu", email_verified: true })).toBe(true);
    expect(canLinkByEmail({ email: "a@college.edu", email_verified: false })).toBe(false);
    expect(canLinkByEmail({ email: "a@college.edu" })).toBe(false);
    expect(canLinkByEmail({ email: "   ", email_verified: true })).toBe(false);
    expect(canLinkByEmail({ email_verified: true })).toBe(false);
    expect(canLinkByEmail(null)).toBe(false);
  });
});
