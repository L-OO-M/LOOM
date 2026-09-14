import { describe, expect, it } from "vitest";
import { MENTOR_BAR, meetsMentorBar, milestoneFor } from "@/lib/mentorship";

describe("mentor bar", () => {
  it("requires both path progress and public proof", () => {
    expect(meetsMentorBar({ pct: 80, done: 8, nodes: 10, oss: 1, solutions: 0, projects: 0, proof: 1 }).eligible).toBe(true);
    const short = meetsMentorBar({ pct: 80, done: 8, nodes: 10, oss: 0, solutions: 0, projects: 0, proof: 0 });
    expect(short.eligible).toBe(false);
    expect(short.reasons.join(" ")).toMatch(/public proof/);
    const early = meetsMentorBar({ pct: 10, done: 1, nodes: 10, oss: 2, solutions: 0, projects: 0, proof: 2 });
    expect(early.eligible).toBe(false);
    expect(early.reasons.join(" ")).toMatch(/40%/);
  });

  it("accepts any single form of public proof", () => {
    const base = { pct: 50, done: 5, nodes: 10 };
    expect(meetsMentorBar({ ...base, oss: 0, solutions: 3, projects: 0, proof: 3 }).eligible).toBe(true);
    expect(meetsMentorBar({ ...base, oss: 0, solutions: 0, projects: 2, proof: 2 }).eligible).toBe(true);
  });

  it("respects a custom bar", () => {
    const stats = { pct: 90, done: 9, nodes: 10, oss: 0, solutions: 0, projects: 0, proof: 0 };
    expect(meetsMentorBar(stats, { ...MENTOR_BAR, publicProof: 0 }).eligible).toBe(true);
  });
});

describe("milestone ladder", () => {
  it("walks bronze → silver → gold", () => {
    expect(milestoneFor(0, 10)).toBeNull();
    expect(milestoneFor(1, 10)).toMatchObject({ key: "roadmap-first-step", level: "bronze" });
    expect(milestoneFor(4, 10)).toMatchObject({ key: "roadmap-first-step", level: "bronze" });
    expect(milestoneFor(5, 10)).toMatchObject({ key: "roadmap-halfway", level: "silver" });
    expect(milestoneFor(9, 10)).toMatchObject({ key: "roadmap-halfway", level: "silver" });
    expect(milestoneFor(10, 10)).toMatchObject({ key: "roadmap-complete", level: "gold" });
  });

  it("handles empty catalogs without awarding", () => {
    expect(milestoneFor(3, 0)).toBeNull();
  });
});
