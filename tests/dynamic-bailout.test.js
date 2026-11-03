import { afterEach, describe, expect, it, vi } from "vitest";

// During `next build`, reading request headers throws a bailout whose `digest`
// is DYNAMIC_SERVER_USAGE: it is how Next says "this route cannot be static".
// The Auth0 branch used to catch it as an auth failure and log a warning, then
// fall back to Supabase -- which threw the same bailout again. The route still
// ended up dynamic, but every build printed bogus "Auth0 session lookup failed"
// warnings, which trains people to ignore the log.
describe("resolveIdentity and Next's dynamic-render bailout", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/auth0");
    vi.doUnmock("@/lib/supabase/server");
  });

  it("rethrows the DYNAMIC_SERVER_USAGE bailout instead of logging it", async () => {
    const bailout = Object.assign(new Error("Dynamic server usage: headers"), {
      digest: "DYNAMIC_SERVER_USAGE"
    });
    vi.resetModules();
    vi.doMock("@/lib/auth0", () => ({
      auth0: { getSession: async () => { throw bailout; } }
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } })
    }));

    const { getSessionIdentity } = await import("@/lib/auth-server");
    await expect(getSessionIdentity()).rejects.toMatchObject({ digest: "DYNAMIC_SERVER_USAGE" });
  });

  it("still falls back to the Supabase session on a real Auth0 failure", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth0", () => ({
      auth0: { getSession: async () => { throw new Error("cookie unreadable"); } }
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } })
    }));

    const { getSessionIdentity } = await import("@/lib/auth-server");
    await expect(getSessionIdentity()).resolves.toBeNull();
  });
});
