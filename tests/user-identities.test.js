import { describe, expect, it } from "vitest";
import { canonicalUserIdFromRows, isVerifiedOAuthEmail } from "@/lib/user-identities";

describe("canonicalUserIdFromRows", () => {
  it("uses the single canonical id shared by linked identities", () => {
    expect(canonicalUserIdFromRows([{ user_id: "u1" }, { user_id: "u1" }]))
      .toEqual({ userId: "u1", conflict: false });
  });

  it("refuses to guess when two canonical accounts share an email", () => {
    expect(canonicalUserIdFromRows([{ user_id: "u1" }, { user_id: "u2" }]))
      .toEqual({ userId: null, conflict: true });
  });

  it("returns no id for an email that has never been linked", () => {
    expect(canonicalUserIdFromRows([])).toEqual({ userId: null, conflict: false });
    expect(canonicalUserIdFromRows(null)).toEqual({ userId: null, conflict: false });
    expect(canonicalUserIdFromRows([{ user_id: null }])).toEqual({ userId: null, conflict: false });
  });
});

describe("isVerifiedOAuthEmail", () => {
  it("accepts confirmed social identities", () => {
    expect(isVerifiedOAuthEmail({
      email: "Ada@College.edu",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "github" }
    })).toBe(true);
    expect(isVerifiedOAuthEmail({
      email: "ada@college.edu",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "email" },
      identities: [{ provider: "email" }, { provider: "github" }]
    })).toBe(true);
  });

  it("rejects email/password and phone identities", () => {
    expect(isVerifiedOAuthEmail({
      email: "ada@college.edu",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "email" }
    })).toBe(false);
    expect(isVerifiedOAuthEmail({
      email: "ada@college.edu",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "phone" }
    })).toBe(false);
  });

  it("rejects unconfirmed or missing identities", () => {
    expect(isVerifiedOAuthEmail({
      email: "ada@college.edu",
      app_metadata: { provider: "github" }
    })).toBe(false);
    expect(isVerifiedOAuthEmail({ app_metadata: { provider: "github" }, email_confirmed_at: "x" })).toBe(false);
    expect(isVerifiedOAuthEmail(null)).toBe(false);
  });
});
