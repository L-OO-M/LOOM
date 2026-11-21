import { describe, expect, it } from "vitest";
import {
  initialsFor,
  listInstitutions,
  matchChapterForInstitution,
  normalizeInstitution
} from "@/lib/chapters";

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

describe("institution -> chapter matching", () => {
  it("normalises case, accents and punctuation to one spelling", () => {
    expect(normalizeInstitution("IIT, Delhi")).toBe("iit delhi");
    expect(normalizeInstitution("  Indian   Institute of Technology — Delhi ")).toBe(
      "indian institute of technology delhi"
    );
    expect(normalizeInstitution("Université de Paris")).toBe("universite de paris");
    expect(normalizeInstitution("")).toBe("");
    expect(normalizeInstitution(null)).toBe("");
  });

  it("does not query for a blank institution", async () => {
    let called = false;
    const sql = () => {
      called = true;
      return Promise.resolve([]);
    };
    expect(await matchChapterForInstitution(sql, "   ")).toBeNull();
    expect(called).toBe(false);
  });

  it("returns the chapter row a match resolves to", async () => {
    const sql = () => Promise.resolve([{ id: "t1", slug: "msit", name: "MSIT" }]);
    expect(await matchChapterForInstitution(sql, "MSIT")).toEqual({
      id: "t1",
      slug: "msit",
      name: "MSIT"
    });
  });

  it("returns null when no chapter has claimed the institution", async () => {
    const sql = () => Promise.resolve([]);
    expect(await matchChapterForInstitution(sql, "Unclaimed College")).toBeNull();
  });

  it("shapes the picker list with the chapter each alias belongs to", async () => {
    const sql = () =>
      Promise.resolve([
        { name: "MSIT", slug: "msit", chapter_name: "MSIT Chapter", city: "Delhi" },
        { name: "MSIT Delhi", slug: "msit", chapter_name: "MSIT Chapter", city: null }
      ]);

    expect(await listInstitutions(sql)).toEqual([
      { name: "MSIT", city: "Delhi", chapter: { slug: "msit", name: "MSIT Chapter" } },
      { name: "MSIT Delhi", city: null, chapter: { slug: "msit", name: "MSIT Chapter" } }
    ]);
  });
});
