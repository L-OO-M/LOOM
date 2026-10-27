import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestContext: vi.fn()
}));

vi.mock("@/lib/auth-server", () => ({
  getRequestContext: mocks.getRequestContext
}));

import { GuardError, requireCan, toGuardResponse } from "@/lib/requirePermission";

function makeContext(overrides = {}) {
  return {
    user: { id: "user-1", email: "member@college.edu" },
    profile: { user_id: "user-1", role: "student", vertical: null, memberships: [] },
    tenant: { id: "tenant-1", slug: "demo-college" },
    sql: vi.fn(),
    error: null,
    ...overrides
  };
}

beforeEach(() => {
  mocks.getRequestContext.mockReset();
});

describe("requireCan context failures fail closed", () => {
  it.each([
    ["UNAUTHORIZED", 401, "Authentication required"],
    ["FORBIDDEN", 403, "Forbidden"],
    ["PROFILE_NOT_FOUND", 404, "Profile not found"],
    ["TENANT_UNRESOLVED", 403, "Tenant could not be resolved"]
  ])("maps %s to %i %s", async (errorCode, status, message) => {
    mocks.getRequestContext.mockResolvedValue(makeContext({ error: errorCode }));

    const thrown = await requireCan("manage_users").catch((e) => e);

    expect(thrown).toBeInstanceOf(GuardError);
    expect(thrown).toMatchObject({ code: errorCode, status, message });
  });

  it("maps any other context error to a generic 500 CONTEXT_ERROR", async () => {
    mocks.getRequestContext.mockResolvedValue(
      makeContext({ error: "SOMETHING_LEAKY", message: "internal failure" })
    );

    const thrown = await requireCan("manage_users").catch((e) => e);

    expect(thrown).toBeInstanceOf(GuardError);
    expect(thrown).toMatchObject({ code: "CONTEXT_ERROR", status: 500 });
    expect(thrown.message).not.toContain("internal failure");
  });

  it("fails closed when getRequestContext throws", async () => {
    mocks.getRequestContext.mockRejectedValue(new Error("database exploded"));

    const thrown = await requireCan("manage_users").catch((e) => e);

    expect(thrown).toBeInstanceOf(GuardError);
    expect(thrown).toMatchObject({ code: "CONTEXT_ERROR", status: 500 });
    expect(thrown.message).not.toContain("database exploded");
  });

  it("returns 401 when the context has no user", async () => {
    mocks.getRequestContext.mockResolvedValue(
      makeContext({ user: null, profile: null, tenant: null, sql: null })
    );

    const thrown = await requireCan("manage_users").catch((e) => e);

    expect(thrown).toBeInstanceOf(GuardError);
    expect(thrown).toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("does not default a missing profile to the student role", async () => {
    mocks.getRequestContext.mockResolvedValue(makeContext({ profile: null }));

    const thrown = await requireCan("register_event").catch((e) => e);

    expect(thrown).toBeInstanceOf(GuardError);
    expect(thrown).toMatchObject({ code: "CONTEXT_ERROR", status: 500 });
  });

  it.each(["tenant", "sql"])("fails closed when %s is missing", async (field) => {
    mocks.getRequestContext.mockResolvedValue(makeContext({ [field]: null }));

    const thrown = await requireCan("register_event").catch((e) => e);

    expect(thrown).toBeInstanceOf(GuardError);
    expect(thrown).toMatchObject({ code: "CONTEXT_ERROR", status: 500 });
  });
});

describe("requireCan valid contexts", () => {
  it("returns the context when the role is allowed", async () => {
    const ctx = makeContext({
      profile: { user_id: "user-1", role: "admin", vertical: null, memberships: [] }
    });
    mocks.getRequestContext.mockResolvedValue(ctx);

    await expect(requireCan("manage_users")).resolves.toBe(ctx);
  });

  it("throws FORBIDDEN when the role is denied", async () => {
    mocks.getRequestContext.mockResolvedValue(makeContext());

    const thrown = await requireCan("manage_users").catch((e) => e);

    expect(thrown).toBeInstanceOf(GuardError);
    expect(thrown).toMatchObject({ code: "FORBIDDEN", status: 403, message: "Forbidden" });
  });

  it("preserves the can() note on a denied action", async () => {
    mocks.getRequestContext.mockResolvedValue(
      makeContext({
        profile: { user_id: "user-1", role: "vertical_lead", vertical: "technical", memberships: [] }
      })
    );

    const thrown = await requireCan("approve_budget").catch((e) => e);

    expect(thrown).toBeInstanceOf(GuardError);
    expect(thrown).toMatchObject({ code: "FORBIDDEN", status: 403, note: "recommend_only" });
  });

  it("keeps the colon permission mapping", async () => {
    const ctx = makeContext();
    mocks.getRequestContext.mockResolvedValue(ctx);

    await expect(requireCan("help:request")).resolves.toBe(ctx);
  });
});

describe("toGuardResponse", () => {
  it("maps typed guard errors with their code, message and status", () => {
    expect(toGuardResponse(new GuardError("PROFILE_NOT_FOUND", 404, "Profile not found"))).toEqual({
      ok: false,
      error: { code: "PROFILE_NOT_FOUND", message: "Profile not found" },
      status: 404
    });

    expect(toGuardResponse(new GuardError("TENANT_UNRESOLVED", 403, "Tenant could not be resolved"))).toEqual({
      ok: false,
      error: { code: "TENANT_UNRESOLVED", message: "Tenant could not be resolved" },
      status: 403
    });
  });

  it("maps any thrown error with a numeric status", () => {
    const e = new Error("Teapot");
    e.code = "TEAPOT";
    e.status = 418;

    expect(toGuardResponse(e)).toEqual({
      ok: false,
      error: { code: "TEAPOT", message: "Teapot" },
      status: 418
    });
  });

  it("uses a safe status default when the error has no code", () => {
    const e = new Error("");

    e.status = 401;

    expect(toGuardResponse(e)).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
      status: 401
    });
  });

  it("preserves the note when present", () => {
    const e = new GuardError("FORBIDDEN", 403, "Forbidden: needs_approval", "needs_approval");

    expect(toGuardResponse(e)).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Forbidden: needs_approval", note: "needs_approval" },
      status: 403
    });
  });

  it("still maps legacy code-only guard errors", () => {
    const e = new Error("Authentication required");
    e.code = "UNAUTHORIZED";

    expect(toGuardResponse(e)).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
      status: 401
    });
  });

  it("returns null for unknown non-guard errors", () => {
    expect(toGuardResponse(new Error("boom"))).toBeNull();
    expect(toGuardResponse({ code: "SOMETHING" })).toBeNull();
    expect(toGuardResponse(null)).toBeNull();
    expect(toGuardResponse(undefined)).toBeNull();
  });
});
