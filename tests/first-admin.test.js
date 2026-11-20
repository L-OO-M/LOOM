import { afterEach, describe, expect, it } from "vitest";
import { MIN_SETUP_CODE_LENGTH, firstAdminSetupEnabled, setupCodeMatches } from "@/lib/first-admin";

const CODE = "first-admin-bootstrap-code-2026";

afterEach(() => {
  delete process.env.FIRST_ADMIN_CODE;
});

describe("first-admin bootstrap code", () => {
  it("is disabled when the secret is unset or blank", () => {
    expect(firstAdminSetupEnabled()).toBe(false);
    expect(setupCodeMatches("")).toBe(false);
    process.env.FIRST_ADMIN_CODE = "   ";
    expect(firstAdminSetupEnabled()).toBe(false);
  });

  it("is disabled for a short code, so a guessable secret is not a gate", () => {
    process.env.FIRST_ADMIN_CODE = "a".repeat(MIN_SETUP_CODE_LENGTH - 1);
    expect(firstAdminSetupEnabled()).toBe(false);
    expect(setupCodeMatches("a".repeat(MIN_SETUP_CODE_LENGTH - 1))).toBe(false);
  });

  it("accepts only the exact configured value, ignoring surrounding whitespace", () => {
    process.env.FIRST_ADMIN_CODE = ` ${CODE} `;
    expect(firstAdminSetupEnabled()).toBe(true);
    expect(setupCodeMatches(CODE)).toBe(true);
    expect(setupCodeMatches(`  ${CODE}  `)).toBe(true);
    expect(setupCodeMatches(`${CODE}!`)).toBe(false);
    expect(setupCodeMatches(CODE.slice(0, -1))).toBe(false);
    expect(setupCodeMatches(undefined)).toBe(false);
    expect(setupCodeMatches(42)).toBe(false);
  });
});
