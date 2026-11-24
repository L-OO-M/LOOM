import { describe, expect, it } from "vitest";
import { studentNav } from "@/lib/nav";
import { STUDENT_TOUR, TOURS, TOUR_VERSION, tourSeen, tourStorageKey } from "@/lib/tour";

const PLACEMENTS = new Set(["top", "bottom", "left", "right"]);

describe("student tour vocabulary", () => {
  it("targets real shell destinations, once each", () => {
    const ids = STUDENT_TOUR.steps.map((step) => step.id);
    const targets = STUDENT_TOUR.steps.map((step) => step.target);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(targets).size).toBe(targets.length);

    const known = new Set(["nav-dashboard", "nav-settings", ...studentNav.map((item) => `nav-${item.id}`)]);
    for (const step of STUDENT_TOUR.steps) {
      const match = step.target.match(/^\[data-tour='([a-z0-9-]+)'\]$/);
      expect(match, step.target).toBeTruthy();
      expect(known.has(match[1]), step.id).toBe(true);
    }
  });

  it("has readable copy, a valid placement and a stable version", () => {
    expect(STUDENT_TOUR.version).toBe(TOUR_VERSION);
    expect(TOURS.student).toBe(STUDENT_TOUR);
    for (const step of STUDENT_TOUR.steps) {
      expect(step.title.length).toBeGreaterThan(4);
      expect(step.body.length).toBeGreaterThan(20);
      expect(PLACEMENTS.has(step.placement), step.id).toBe(true);
    }
  });
});

describe("tour completion state", () => {
  it("keys storage per user and tour version", () => {
    expect(tourStorageKey("user-1", "student")).toBe(`loom-tour:user-1:student:${TOUR_VERSION}`);
    expect(tourStorageKey(null, "student")).toBe(`loom-tour:anon:student:${TOUR_VERSION}`);
  });

  it("treats an older stored version as unseen", () => {
    expect(tourSeen({ student: TOUR_VERSION }, "student")).toBe(true);
    expect(tourSeen({ student: TOUR_VERSION + 1 }, "student")).toBe(true);
    expect(tourSeen({ student: TOUR_VERSION - 1 }, "student")).toBe(false);
    expect(tourSeen({}, "student")).toBe(false);
    expect(tourSeen(null, "student")).toBe(false);
    expect(tourSeen({ student: "yes" }, "student")).toBe(false);
  });
});
