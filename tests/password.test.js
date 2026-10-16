import { describe, expect, it } from "vitest";
import { validatePassword } from "@/lib/password";

describe("password policy", () => {
  it("accepts a 6+ char password with 1 number and 1 special char", () => {
    expect(validatePassword("abc1!d").ok).toBe(true);
    expect(validatePassword("Passw0rd!").ok).toBe(true);
  });

  it("rejects short passwords", () => {
    expect(validatePassword("a1!b2").ok).toBe(false);
    expect(validatePassword("").ok).toBe(false);
  });

  it("rejects passwords without a number", () => {
    expect(validatePassword("abcdef!").ok).toBe(false);
  });

  it("rejects passwords without a special character", () => {
    expect(validatePassword("abcdef1").ok).toBe(false);
  });
});
