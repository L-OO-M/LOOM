import { afterEach, describe, expect, it } from "vitest";
import { auth0ManagementDomain, isAuth0ManagementConfigured, summarizeAuth0Security } from "@/lib/auth0-management";

const originalEnv = {
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
  AUTH0_MANAGEMENT_DOMAIN: process.env.AUTH0_MANAGEMENT_DOMAIN,
  AUTH0_MANAGEMENT_CLIENT_ID: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
  AUTH0_MANAGEMENT_CLIENT_SECRET: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
  AUTH0_DB_CONNECTION: process.env.AUTH0_DB_CONNECTION
};

afterEach(() => {
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
