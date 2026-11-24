import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Auth0ManagementError,
  auth0Username,
  auth0ManagementDomain,
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
