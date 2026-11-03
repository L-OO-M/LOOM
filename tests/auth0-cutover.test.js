import { beforeEach, describe, expect, it, vi } from "vitest";

describe("server-side Auth0 cutover", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/env");
    vi.doUnmock("@/lib/auth-server");
    vi.doMock("@/lib/env", () => ({ auth0OnlyEnabled: () => true }));
    vi.doMock("@/lib/auth-server", () => ({
      getRequestContext: async () => ({ error: "UNAUTHORIZED" }),
      writeAudit: async () => {}
    }));
  });

  it("rejects legacy email-verification minting during cutover", async () => {
    const { POST } = await import("@/app/api/auth/verify-email/start/route");
    const response = await POST();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("AUTH0_ONLY");
  });

  it("does not exchange a Supabase callback code during cutover", async () => {
    const { GET } = await import("@/app/auth/supabase-callback/route");
    const response = await GET(new Request("https://loom.example/auth/supabase-callback?code=abc"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://loom.example/login?error=auth0_only");
  });
});
