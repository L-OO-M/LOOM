import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Auth0ManagementError,
  auth0Username,
  auth0ManagementDomain,
  ensurePasswordIdentity,
  getPasswordPolicy,
  isAuth0ManagementConfigured,
  isPasswordPolicyError,
  summarizeAuth0Security
} from "@/lib/auth0-management";

const originalEnv = {
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
  AUTH0_MANAGEMENT_DOMAIN: process.env.AUTH0_MANAGEMENT_DOMAIN,
  AUTH0_MANAGEMENT_CLIENT_ID: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
  AUTH0_MANAGEMENT_CLIENT_SECRET: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
  AUTH0_DB_CONNECTION: process.env.AUTH0_DB_CONNECTION
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Auth0 management configuration", () => {
  it("requires the domain and both management credentials", () => {
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_MANAGEMENT_CLIENT_ID;
    delete process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
    expect(isAuth0ManagementConfigured()).toBe(false);

    process.env.AUTH0_DOMAIN = "https://tenant.example.auth0.com/";
    process.env.AUTH0_MANAGEMENT_CLIENT_ID = "client-id";
    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = "client-secret";
    expect(isAuth0ManagementConfigured()).toBe(true);
  });

  // A custom sign-in domain must not move the Management API audience: Auth0 only
  // accepts `https://<tenant>.auth0.com/api/v2/`, so AUTH0_MANAGEMENT_DOMAIN keeps
  // the tenant while AUTH0_DOMAIN serves the branded login.
  it("keeps management on the tenant domain when sign-in uses a custom one", () => {
    process.env.AUTH0_DOMAIN = "https://auth.lets-loom.xyz/";
    process.env.AUTH0_MANAGEMENT_DOMAIN = "https://lets-loom.jp.auth0.com/";
    process.env.AUTH0_MANAGEMENT_CLIENT_ID = "client-id";
    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = "client-secret";

    expect(auth0ManagementDomain()).toBe("lets-loom.jp.auth0.com");
    expect(isAuth0ManagementConfigured()).toBe(true);
  });

  it("falls back to AUTH0_DOMAIN when no management domain is set", () => {
    delete process.env.AUTH0_MANAGEMENT_DOMAIN;
    process.env.AUTH0_DOMAIN = "https://tenant.example.auth0.com/";
    expect(auth0ManagementDomain()).toBe("tenant.example.auth0.com");
  });
});

describe("summarizeAuth0Security", () => {
  it("reports a linked database identity as a password", () => {
    const summary = summarizeAuth0Security({
      email_verified: true,
      identities: [
        { provider: "google-oauth2", connection: "google-oauth2", isSocial: true },
        { provider: "auth0", connection: "Username-Password-Authentication", isSocial: false }
      ]
    });
    expect(summary.hasPassword).toBe(true);
    expect(summary.emailVerified).toBe(true);
    expect(summary.identities).toHaveLength(2);
    expect(summary.identities[1]).toEqual({
      provider: "auth0",
      connection: "Username-Password-Authentication",
      isSocial: false
    });
  });

  it("does not treat a database identity on another connection as a password", () => {
    expect(summarizeAuth0Security({
      identities: [{ provider: "auth0", connection: "Other-Database" }]
    }, "Username-Password-Authentication").hasPassword).toBe(false);
  });

  it("handles social-only and malformed users", () => {
    expect(summarizeAuth0Security({
      identities: [{ provider: "github", connection: "github" }]
    }).hasPassword).toBe(false);
    expect(summarizeAuth0Security(null)).toEqual({
      hasPassword: false,
      email: null,
      emailVerified: false,
      identities: []
    });
  });
});

describe("auth0Username", () => {
  // The connection rejects a create with `Missing required property: username`
  // before it looks at the password, so a valid username is mandatory.
  it("prefers the public handle and lowercases it", () => {
    expect(auth0Username({ handle: "Ishaan S04" })).toBe("ishaan-s04");
  });

  it("stays inside the connection's 15-character limit", () => {
    expect(auth0Username({ handle: "a".repeat(20) })).toBe("a".repeat(15));
    expect(auth0Username({ handle: "abcd-----------" })).toBe("abcd");
  });

  it("skips a value the connection would read as a phone number", () => {
    expect(auth0Username({ handle: "1234567890", githubUsername: "ishaans04" })).toBe("ishaans04");
  });

  it("falls through the GitHub handle and the address, then the opaque id", () => {
    expect(auth0Username({ githubUsername: "gh-user" })).toBe("gh-user");
    expect(auth0Username({ email: "First.Last@example.com" })).toBe("first.last");
    expect(auth0Username({ userId: "3f9a1c2e-7b4d-4f0a-9e11-2c3d4e5f6a7b" })).toBe("u_3f9a1c2e7b4d");
  });
});

describe("isPasswordPolicyError", () => {
  it("recognises a real strength rejection", () => {
    expect(isPasswordPolicyError(
      new Auth0ManagementError("Bad Request", "PasswordStrengthError: Password is too weak", 400)
    )).toBe(true);
  });

  // This is the misclassification that hid the missing-username bug for days.
  it("does not blame the password for a malformed request", () => {
    expect(isPasswordPolicyError(
      new Auth0ManagementError("invalid_body", "Payload validation error: 'Missing required property: username'.", 400)
    )).toBe(false);
  });

  it("ignores non-400 failures and non-Auth0 errors", () => {
    expect(isPasswordPolicyError(
      new Auth0ManagementError("Bad Request", "PasswordStrengthError: Password is too weak", 500)
    )).toBe(false);
    expect(isPasswordPolicyError(new Error("nope"))).toBe(false);
  });
});

describe("getPasswordPolicy", () => {
  it("reports nothing when the connection cannot be read", async () => {
    process.env.AUTH0_DOMAIN = "https://tenant.example.auth0.com/";
    process.env.AUTH0_MANAGEMENT_CLIENT_ID = "client-id";
    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = "client-secret";
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).includes("/oauth/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "token", expires_in: 300 }) };
      }
      return { ok: false, status: 403, json: async () => ({ message: "Forbidden" }) };
    }));

    await expect(getPasswordPolicy()).resolves.toBeNull();
  });

  it("reads the connection's real minimum and username requirement", async () => {
    process.env.AUTH0_DOMAIN = "https://tenant.example.auth0.com/";
    process.env.AUTH0_MANAGEMENT_CLIENT_ID = "client-id";
    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = "client-secret";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        options: {
          password_options: { complexity: { min_length: 15 } },
          attributes: { username: { signup: { status: "required" } } }
        }
      })
    })));

    await expect(getPasswordPolicy()).resolves.toEqual({ minLength: 15, requiresUsername: true });
  });
});

describe("ensurePasswordIdentity", () => {
  function stubFetch(handler) {
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const call = { url: String(url), method: options.method || "GET", body: options.body };
      calls.push(call);
      const result = await handler(call.url, options);
      return {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        json: async () => result.body
      };
    }));
    return calls;
  }

  function configured() {
    process.env.AUTH0_DOMAIN = "https://tenant.example.auth0.com/";
    process.env.AUTH0_MANAGEMENT_CLIENT_ID = "client-id";
    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = "client-secret";
    process.env.AUTH0_DB_CONNECTION = "Username-Password-Authentication";
  }

  // The database identity's own user_id is the bare id ("6b05…"); the API only
  // accepts the prefixed form ("auth0|6b05…"). Sending the bare id failed with
  // invalid_uri, so an existing password could never be changed.
  it("changes the password on the primary user, not the bare identity id", async () => {
    configured();
    const calls = stubFetch((url) => {
      if (url.includes("/oauth/token")) return { status: 200, body: { access_token: "token", expires_in: 300 } };
      if (url.endsWith("/identities")) return { status: 201, body: {} };
      if (url.includes("/users/")) {
        return {
          status: 200,
          body: {
            user_id: "google-oauth2|123",
            email: "ishaans@example.test",
            email_verified: true,
            identities: [
              { provider: "google-oauth2", connection: "google-oauth2" },
              {
                provider: "auth0",
                connection: "Username-Password-Authentication",
                user_id: "6b0570d6395a936458d649c5"
              }
            ]
          }
        };
      }
      return { status: 404, body: {} };
    });

    await expect(ensurePasswordIdentity({
      sub: "google-oauth2|123",
      email: "ishaans@example.test",
      emailVerified: true,
      password: "a long enough passphrase",
      userId: "3f9a1c2e-7b4d-4f0a-9e11-2c3d4e5f6a7b"
    })).resolves.toEqual({ hasPassword: true, created: false });

    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch).toBeTruthy();
    expect(decodeURIComponent(patch.url)).toContain("/users/google-oauth2|123");
    expect(decodeURIComponent(patch.url)).not.toContain("6b0570d6395a936458d649c5");
  });

  // The create call is the one that used to fail with `Missing required
  // property: username` before Auth0 ever looked at the password.
  it("creates the database identity with the derived username and links it", async () => {
    configured();
    const calls = stubFetch((url, options) => {
      if (url.includes("/oauth/token")) return { status: 200, body: { access_token: "token", expires_in: 300 } };
      if (url.endsWith("/api/v2/users") && options.method === "POST") {
        return { status: 201, body: { user_id: "auth0|new" } };
      }
      if (url.endsWith("/identities")) return { status: 201, body: {} };
      if (url.includes("/users/")) {
        return {
          status: 200,
          body: {
            user_id: "google-oauth2|123",
            email: "ishaans@example.test",
            email_verified: true,
            identities: [{ provider: "google-oauth2", connection: "google-oauth2" }]
          }
        };
      }
      return { status: 404, body: {} };
    });

    await expect(ensurePasswordIdentity({
      sub: "google-oauth2|123",
      email: "ishaans@example.test",
      emailVerified: true,
      password: "a long enough passphrase",
      username: "ishaans04",
      userId: "3f9a1c2e-7b4d-4f0a-9e11-2c3d4e5f6a7b"
    })).resolves.toEqual({ hasPassword: true, created: true });

    const create = calls.find((call) => call.method === "POST" && call.url.endsWith("/api/v2/users"));
    expect(create).toBeTruthy();
    expect(JSON.parse(create.body).username).toBe("ishaans04");
    expect(calls.some((call) => call.url.endsWith("/identities"))).toBe(true);
  });
});
