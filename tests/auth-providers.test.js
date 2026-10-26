import { describe, expect, it } from "vitest";
import { normalizeAuthProviders } from "@/lib/auth-providers";

// The Supabase /auth/v1/settings payload is the only authoritative answer to
// "will this provider work?". The button must act on an explicit false and
// ignore everything else.
describe("normalizeAuthProviders", () => {
  it("reads the external provider flags", () => {
    expect(normalizeAuthProviders({ external: { email: true, github: false } }))
      .toEqual({ email: true, github: false });
    expect(normalizeAuthProviders({ external: { email: true, github: true } }))
      .toEqual({ email: true, github: true });
  });

  it("treats missing fields and malformed payloads as disabled, not enabled", () => {
    expect(normalizeAuthProviders({})).toEqual({ email: false, github: false });
    expect(normalizeAuthProviders(null)).toEqual({ email: false, github: false });
    expect(normalizeAuthProviders({ external: { github: "true" } }).github).toBe(false);
  });
});
