import { afterEach, describe, expect, it } from "vitest";
import { isAuth0ManagementConfigured, summarizeAuth0Security } from "@/lib/auth0-management";

const originalEnv = {
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
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
      emailVerified: false,
      identities: []
    });
  });
});
