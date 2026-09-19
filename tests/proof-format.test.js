import { describe, expect, it } from "vitest";
import {
  labelFor,
  sourceKey,
  sourceLabel,
  levelLabel,
  groupLinksByAchievement,
  linksFor,
  evidenceKind,
  nextMilestone,
  formatShortDate
} from "../app/(app)/student/credentials/proof-format.js";

describe("proof labels", () => {
  it("names badge achievements by badge name", () => {
    expect(labelFor({ badge_name: "DSA Contest Master", source_type: "manual" })).toBe("DSA Contest Master");
  });

  it("names source achievements without inventing titles", () => {
    expect(labelFor({ source_type: "oss", source_ref: "first-pr" })).toBe("OSS · first-pr");
    expect(labelFor({ source_type: "contest", source_ref: "winter-24" })).toBe("Contest · winter-24");
    expect(labelFor({ source_type: "roadmap", source_ref: "roadmap-first-step" })).toBe("Roadmap · First step");
    expect(labelFor({ source_type: "roadmap", source_ref: "unknown-key" })).toBe("Roadmap · unknown-key");
  });

  it("falls back honestly for empty rows", () => {
    expect(labelFor(null)).toBe("Achievement");
    expect(labelFor({})).toBe("Achievement");
  });
});

describe("proof sources", () => {
  it("maps manual and contest rows to chapter-issued", () => {
    expect(sourceKey({ source_type: "manual" })).toBe("chapter");
    expect(sourceKey({ source_type: "contest", source_ref: "x" })).toBe("chapter");
    expect(sourceKey({ source_type: "roadmap" })).toBe("roadmap");
    expect(sourceKey({ source_type: "oss" })).toBe("oss");
    expect(sourceKey(null)).toBe("chapter");
  });

  it("labels every source", () => {
    expect(sourceLabel({ source_type: "oss" })).toBe("Open source");
    expect(sourceLabel({ source_type: "roadmap" })).toBe("Roadmap");
    expect(sourceLabel({ source_type: "manual" })).toBe("Chapter");
  });

  it("passes levels through without gamification", () => {
    expect(levelLabel("gold")).toBe("Gold");
    expect(levelLabel("platinum")).toBe(null);
    expect(levelLabel(null)).toBe(null);
  });
});

describe("credential grouping", () => {
  const creds = [
    { id: "cred_a1", achievement_id: "ach-1" },
    { id: "cred_a2", achievement_id: "ach-1" },
    { id: "cred_b1", achievement_id: "ach-2" }
  ];

  it("keeps every credential — never collapses duplicates", () => {
    const groups = groupLinksByAchievement(creds);
    expect(linksFor(groups, "ach-1")).toHaveLength(2);
    expect(linksFor(groups, "ach-2")).toHaveLength(1);
    expect(linksFor(groups, "ach-3")).toHaveLength(0);
  });
});

describe("evidence kinds", () => {
  it("routes internal paths in-app and the rest externally", () => {
    expect(evidenceKind("/student/roadmap")).toBe("internal");
    expect(evidenceKind("https://github.com/org/repo/pull/1")).toBe("external");
    expect(evidenceKind("")).toBe(null);
    expect(evidenceKind(null)).toBe(null);
  });
});

describe("next milestone", () => {
  it("derives the smallest unearned threshold", () => {
    expect(nextMilestone(0, 10)).toEqual({ key: "roadmap-first-step", label: "First step", remaining: 1 });
    expect(nextMilestone(1, 10)).toMatchObject({ key: "roadmap-halfway", remaining: 4 });
    expect(nextMilestone(5, 10)).toMatchObject({ key: "roadmap-complete", remaining: 5 });
  });

  it("returns null when nothing can be derived", () => {
    expect(nextMilestone(10, 10)).toBe(null);
    expect(nextMilestone(12, 10)).toBe(null);
    expect(nextMilestone(0, 0)).toBe(null);
  });
});

describe("formatShortDate", () => {
  it("formats real dates and rejects the rest", () => {
    expect(formatShortDate("2026-09-17T00:00:00.000Z")).toContain("2026");
    expect(formatShortDate(null)).toBe(null);
    expect(formatShortDate("not-a-date")).toBe(null);
  });
});
