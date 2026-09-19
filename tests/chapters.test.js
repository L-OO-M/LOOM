import { describe, expect, it } from "vitest";
import { initialsFor } from "@/lib/chapters";

describe("chapter avatar initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initialsFor("MSIT Chapter")).toBe("MC");
    expect(initialsFor("St. Stephen's College")).toBe("SS");
  });

  it("collapses to two letters for single-word names", () => {
    expect(initialsFor("Loom")).toBe("LO");
    expect(initialsFor("X")).toBe("X");
  });

  it("ignores leading articles and separators", () => {
    expect(initialsFor("The Builders Club")).toBe("BC");
    expect(initialsFor("dev-society")).toBe("DS");
  });

  it("never throws on empty or non-string input", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
    expect(initialsFor(null)).toBe("?");
    expect(initialsFor(undefined)).toBe("?");
  });
});
