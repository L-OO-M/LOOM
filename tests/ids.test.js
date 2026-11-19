import { describe, expect, it } from "vitest";
import { UUID_RE, isUuid } from "@/lib/ids";

// A shape check before a Postgres uuid column turns garbage into a 22P02 500.
// The predicate is deliberately strict: route params are either a uuid or they
// are not found, and "close enough" strings must not reach the database.

const VALID = [
  "11111111-1111-4111-8111-111111111111",
  "00000000-0000-0000-0000-000000000000",
  "ABCDEF01-2345-6789-ABCD-EF0123456789",
  "abcdef01-2345-6789-abcd-ef0123456789"
];

const INVALID = [
  "",
  "not-a-uuid",
  "11111111-1111-4111-8111-11111111111", // one char short
  "11111111-1111-4111-8111-1111111111111", // one char long
  "11111111111141118111111111111111", // no dashes
  "{11111111-1111-4111-8111-111111111111}", // braces
  "11111111-1111-4111-8111-11111111111g", // invalid hex
  " 11111111-1111-4111-8111-111111111111", // leading space
  "11111111-1111-4111-8111-111111111111\n", // trailing newline
  "11111111-1111-4111-8111_111111111111"
];

describe("isUuid", () => {
  it("accepts canonical UUID strings in either case", () => {
    for (const value of VALID) expect(isUuid(value), value).toBe(true);
  });

  it("rejects malformed shapes instead of coercing them", () => {
    for (const value of INVALID) expect(isUuid(value), JSON.stringify(value)).toBe(false);
  });

  it("rejects non-string values without throwing", () => {
    for (const value of [null, undefined, 42, {}, [], true, Symbol("x")]) {
      expect(isUuid(value)).toBe(false);
    }
  });

  it("anchors the pattern so a uuid prefix is not enough", () => {
    expect(UUID_RE.test(`${VALID[0]}-extra`)).toBe(false);
    expect(UUID_RE.test(`prefix-${VALID[0]}`)).toBe(false);
  });
});
