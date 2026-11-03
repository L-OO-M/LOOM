import { describe, expect, it } from "vitest";
import {
  announcementDedupeKey,
  announcementKeyPrefix,
  recipientScopeOf
} from "@/lib/announcement-fanout";

const ANNOUNCEMENT = "a0b1c2d3-0000-4000-8000-000000000001";
const USER = "u-1";

describe("announcementKeyPrefix", () => {
  it("is the single prefix the route binds, with the recipient appended in SQL", () => {
    const prefix = announcementKeyPrefix(ANNOUNCEMENT);
    expect(prefix).toBe(`announcement:${ANNOUNCEMENT}:`);
    // SQL appends the user id, so prefix + user must equal the composed key.
    expect(prefix + USER).toBe(announcementDedupeKey(ANNOUNCEMENT, USER));
  });

  it("throws on a missing announcement id", () => {
    expect(() => announcementKeyPrefix(undefined)).toThrow(/announcement id/);
    expect(() => announcementKeyPrefix("   ")).toThrow(/announcement id/);
  });
});

describe("announcementDedupeKey", () => {
  it("is stable across retries", () => {
    expect(announcementDedupeKey(ANNOUNCEMENT, USER)).toBe(announcementDedupeKey(ANNOUNCEMENT, USER));
  });

  it("uses the format the fan-out SQL writes", () => {
    expect(announcementDedupeKey(ANNOUNCEMENT, USER)).toBe(`announcement:${ANNOUNCEMENT}:${USER}`);
  });

  it("embeds the announcement id", () => {
    expect(announcementDedupeKey(ANNOUNCEMENT, USER)).toContain(ANNOUNCEMENT);
  });

  it("differs per recipient", () => {
    expect(announcementDedupeKey(ANNOUNCEMENT, USER)).not.toBe(announcementDedupeKey(ANNOUNCEMENT, "u-2"));
  });

  it("differs per announcement", () => {
    expect(announcementDedupeKey(ANNOUNCEMENT, USER)).not.toBe(announcementDedupeKey("other-id", USER));
  });

  it("throws on a missing announcement id instead of writing a colliding key", () => {
    expect(() => announcementDedupeKey(undefined, USER)).toThrow(/announcement id/);
    expect(() => announcementDedupeKey("", USER)).toThrow(/announcement id/);
    expect(() => announcementDedupeKey(null, USER)).toThrow(/announcement id/);
  });

  it("throws on a missing user id", () => {
    expect(() => announcementDedupeKey(ANNOUNCEMENT, undefined)).toThrow(/user id/);
    expect(() => announcementDedupeKey(ANNOUNCEMENT, "  ")).toThrow(/user id/);
  });
});

describe("recipientScopeOf", () => {
  it.each(["society", "vertical", "department"])("accepts %s", (scope) => {
    expect(recipientScopeOf(scope)).toBe(scope);
  });

  it.each([undefined, null, "", "Society", "global", 42])("rejects %s", (scope) => {
    expect(() => recipientScopeOf(scope)).toThrow(/Unsupported announcement scope/);
  });
});
