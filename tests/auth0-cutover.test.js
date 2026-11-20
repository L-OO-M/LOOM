import { describe, expect, it } from "vitest";

// The cutover is finished, so these are no longer "during migration" checks.
// Every Supabase credential path must be gone for good: Auth0 is the only front
// door, and nothing in the deployment can switch the old one back on.
describe("Supabase email auth is retired", () => {
  it("refuses legacy email/password sign-in", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST();
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.error.code).toBe("AUTH0_ONLY");
  });

  it("refuses legacy registration", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const response = await POST();
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.error.code).toBe("AUTH0_ONLY");
  });

  it("refuses to mint its own email-verification token", async () => {
    const { POST } = await import("@/app/api/auth/verify-email/start/route");
    const response = await POST();
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.error.code).toBe("AUTH0_ONLY");
  });

  it("redirects a stale Supabase callback instead of exchanging a code", async () => {
    const { GET } = await import("@/app/auth/supabase-callback/route");
    const response = await GET(new Request("https://loom.example/auth/supabase-callback?code=abc"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://loom.example/login?error=auth0_only");
  });
});
