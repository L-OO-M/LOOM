import { describe, expect, it } from "vitest";
import {
  PRACTICE_SOURCES,
  PRACTICE_TRACKS,
  isVerifiedSource,
  slugFromTitle,
  sourceForUrl,
  sourceLabel,
  suggestionsFor,
  trackFor,
  trackOptionsForDepartments
} from "@/lib/practice-catalog";

describe("practice resource catalogue", () => {
  it("ships seven real hosted suggestions for every track", () => {
    expect(PRACTICE_TRACKS.length).toBeGreaterThanOrEqual(6);
    for (const track of PRACTICE_TRACKS) {
      expect(track.suggestions, track.slug).toHaveLength(7);
      expect(new Set(track.suggestions.map((item) => item.url)).size, track.slug).toBe(7);
      for (const item of track.suggestions) {
        expect(item.url, `${track.slug}: ${item.title}`).toMatch(/^https:\/\//);
        expect(item.title.length).toBeGreaterThan(2);
        expect(["Easy", "Medium", "Hard"]).toContain(item.difficulty);
      }
    }
  });

  it("maps every suggested host to a known provider", () => {
    for (const track of PRACTICE_TRACKS) {
      for (const item of track.suggestions) {
        const source = sourceForUrl(item.url);
        expect(source, item.url).not.toBe("other");
        expect(PRACTICE_SOURCES[source]).toBeTruthy();
      }
    }
  });

  it("only claims automatic verification for LeetCode", () => {
    expect(isVerifiedSource("leetcode")).toBe(true);
    for (const key of Object.keys(PRACTICE_SOURCES)) {
      if (key !== "leetcode") expect(isVerifiedSource(key), key).toBe(false);
    }
  });

  it("resolves a track from the department slug or its display name", () => {
    expect(trackFor("ai_ml")?.slug).toBe("ai_ml");
    expect(trackFor("DSA & Problem Solving")?.slug).toBe("dsa");
    expect(trackFor("cyber security")).toBeNull();
    expect(suggestionsFor("dsa")).toHaveLength(7);
    expect(suggestionsFor("design")).toEqual([]);
  });

  it("returns copies so a caller cannot mutate the shipped catalogue", () => {
    const first = suggestionsFor("web");
    first[0].title = "changed";
    expect(suggestionsFor("web")[0].title).not.toBe("changed");
  });

  it("labels unknown providers honestly instead of guessing", () => {
    expect(sourceForUrl("https://example.com/challenge")).toBe("other");
    expect(sourceLabel("other")).toBe(PRACTICE_SOURCES.other.label);
    expect(sourceForUrl("not a url")).toBe("other");
  });

  it("builds a safe slug from a title and keeps a department's own label", () => {
    expect(slugFromTitle("Titanic — Machine Learning (2024)")).toBe("titanic-machine-learning-2024");
    const options = trackOptionsForDepartments([
      { slug: "ai_ml", name: "AI / ML" },
      { slug: "robotics", name: "Robotics" }
    ]);
    expect(options[0].provider).toBe("Kaggle");
    expect(options[1]).toMatchObject({ slug: "robotics", label: "Robotics", provider: null });
  });
});
