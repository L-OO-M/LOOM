import { afterEach, describe, expect, it, vi } from "vitest";

async function callSignout({ auth0 }) {
  vi.resetModules();
  vi.doMock("@/lib/auth0", () => ({ auth0 }));
  vi.doMock("@/lib/supabase/server", () => ({
    createServerSupabase: async () => ({ auth: { signOut: async () => {} } })
  }));
  const { POST } = await import("@/app/auth/signout/route");
  return POST(new Request("http://localhost/auth/signout", { method: "POST" }));
}

describe("POST /auth/signout", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/auth0");
    vi.doUnmock("@/lib/supabase/server");
  });

  it("redirects to Auth0 logout with GET semantics", async () => {
    const response = await callSignout({ auth0: {} });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/auth/logout");
  });

  it("redirects home with GET semantics when Auth0 is off", async () => {
    const response = await callSignout({ auth0: null });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });
});
