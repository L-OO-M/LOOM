import { beforeEach, describe, expect, it, vi } from "vitest";

// /auth/continue exists because Auth0 finishes the OAuth exchange in the
// middleware and then redirects to `returnTo`. Without this route the SDK's
// default landed a freshly authenticated member on the public marketing page,
// which reads as "the login did not work". Every branch below is a destination
// a real account can be in on first sign-in; a silent 200 in the middle of a
// login is the bug this pins.

const mocks = vi.hoisted(() => ({
  getRequestContext: vi.fn()
}));

vi.mock("@/lib/auth-server", () => ({
  getRequestContext: mocks.getRequestContext
}));

import { GET } from "@/app/auth/continue/route";

function ctx(overrides = {}) {
  return {
    user: { id: "user-1", email: "member@college.edu" },
    profile: { user_id: "user-1", role: "student", onboarding_completed: true },
    tenant: { id: "tenant-1", slug: "demo-college" },
    error: null,
    ...overrides
  };
}

async function follow(overrides) {
  mocks.getRequestContext.mockResolvedValue(ctx(overrides));
  const response = await GET();
  return {
    status: response.status,
    location: response.headers.get("location")
  };
}

beforeEach(() => {
  mocks.getRequestContext.mockReset();
});

describe("/auth/continue routes a completed sign-in to a real destination", () => {
  it.each([
    ["no session", { user: null }, "/login"],
    ["expired session", { error: "UNAUTHORIZED" }, "/login"],
    ["policy not accepted", { error: "CONSENT_REQUIRED" }, "/consent"],
    ["suspended", { error: "ACCOUNT_SUSPENDED" }, "/account-status?state=suspended"],
    ["deactivated", { error: "ACCOUNT_DEACTIVATED" }, "/account-status?state=deactivated"],
    ["half-provisioned profile", { error: "PROFILE_NOT_FOUND" }, "/login?error=account_unresolved"],
    ["tenant could not resolve", { error: "TENANT_UNRESOLVED" }, "/login?error=account_unresolved"],
    ["an unlisted context error", { error: "SOMETHING_UNEXPECTED" }, "/login"]
  ])("sends %s to %s", async (_label, overrides, target) => {
    const { status, location } = await follow(overrides);
    expect(status).toBe(303);
    expect(location).toBe(target);
  });

  it.each([
    ["student", { role: "student", onboarding_completed: true }, "/student"],
    ["student who has not finished onboarding", { role: "student", onboarding_completed: false }, "/student/onboarding"],
    ["department lead", { role: "dept_lead" }, "/lead"],
    ["vertical lead", { role: "vertical_lead" }, "/lead"],
    ["admin", { role: "admin" }, "/admin"],
    ["platform admin", { role: "platform_admin" }, "/admin"],
    ["founder whose stored role is still student", { role: "student", effectiveRole: "admin" }, "/admin"]
  ])("lands %s on %s", async (_label, profile, target) => {
    const { status, location } = await follow({ profile: { user_id: "user-1", ...profile } });
    expect(status).toBe(303);
    expect(location).toBe(target);
  });

  it("never answers 200 mid-login", async () => {
    const { status } = await follow({});
    expect(status).not.toBe(200);
  });
});
