import { describe, expect, it } from "vitest";
import { signCredential, verifyCredentialSignature } from "@/lib/credentials";

describe("credentials signing", () => {
  it("signs and verifies a credential", () => {
    const parts = { id: "cred_abc123", studentId: "user-1", type: "badge", issuedAt: "2026-01-01T00:00:00.000Z" };
    const signature = signCredential(parts);
    expect(verifyCredentialSignature({ ...parts, signature })).toBe(true);
  });

  it("rejects tampered fields", () => {
    const parts = { id: "cred_abc123", studentId: "user-1", type: "badge", issuedAt: "2026-01-01T00:00:00.000Z" };
    const signature = signCredential(parts);
    expect(verifyCredentialSignature({ ...parts, studentId: "user-2", signature })).toBe(false);
    expect(verifyCredentialSignature({ ...parts, signature: "deadbeef" })).toBe(false);
    expect(verifyCredentialSignature({ ...parts, signature: null })).toBe(false);
  });
});
