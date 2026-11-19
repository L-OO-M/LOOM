import { describe, expect, it } from "vitest";
import { AUTH_UNAVAILABLE, isTransientAuthError } from "@/lib/auth-errors";

// The cost of getting this wrong is high in both directions: a transient
// outage read as "signed out" bounces a valid session to /login, while a real
// 401 read as transient would keep a dead session alive. The matrix below is the
// behavioural contract shared by middleware.js and lib/auth-server.js.

describe("isTransientAuthError", () => {
  it("treats an absent error as not transient", () => {
    expect(isTransientAuthError(null)).toBe(false);
    expect(isTransientAuthError(undefined)).toBe(false);
  });

  it("recognises the supabase-js retryable fetch error by name", () => {
    expect(isTransientAuthError({ name: "AuthRetryableFetchError", message: "x" })).toBe(true);
  });

  it("treats status 0 and 5xx as an outage, not a session decision", () => {
    for (const status of [0, 500, 502, 503, 504]) {
      expect(isTransientAuthError({ status, message: "upstream" })).toBe(true);
    }
  });

  it("does not treat 4xx as transient", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(isTransientAuthError({ status, message: "no" })).toBe(false);
    }
  });

  it("matches common socket-level failure messages", () => {
    for (const message of [
      "fetch failed",
      "read ECONNRESET",
      "connect ECONNREFUSED 10.0.0.1:6543",
      "ETIMEDOUT",
      "getaddrinfo ENOTFOUND db.example",
      "EAI_AGAIN",
      "socket hang up",
      "network error"
    ]) {
      expect(isTransientAuthError({ message }), message).toBe(true);
    }
  });

  it("does not match an ordinary credential failure", () => {
    for (const message of [
      "Invalid login credentials",
      "Email not confirmed",
      "User not found",
      "JWT expired",
      ""
    ]) {
      expect(isTransientAuthError({ message }), message).toBe(false);
    }
  });

  it("handles objects with no message or status", () => {
    expect(isTransientAuthError({})).toBe(false);
    expect(isTransientAuthError(new Error(""))).toBe(false);
    expect(isTransientAuthError("fetch failed")).toBe(false);
  });

  it("exposes a machine-readable code so clients can tell outage from 401", () => {
    expect(AUTH_UNAVAILABLE).toBe("AUTH_UNAVAILABLE");
  });
});
