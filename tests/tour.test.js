import { describe, expect, it } from "vitest";
import { adminNav, leadNav, studentNav } from "@/lib/nav";
import { ADMIN_TOUR, LEAD_TOUR, SHELL_TOURS, STUDENT_TOUR, TOURS, TOUR_VERSION, tourForArea, tourSeen, tourStorageKey } from "@/lib/tour";

const PLACEMENTS = new Set(["top", "bottom", "left", "right"]);

function assertTour(tour, nav, extra = []) {
  const ids = tour.steps.map((step) => step.id);
  const targets = tour.steps.map((step) => step.target);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(targets).size).toBe(targets.length);

  const known = new Set([...extra, ...nav.map((item) => `nav-${item.id}`)]);
  for (const step of tour.steps) {
    const match = step.target.match(/^\[data-tour='([a-z0-9-]+)'\]$/);
    expect(match, step.target).toBeTruthy();
    expect(known.has(match[1]), step.id).toBe(true);
  }
  for (const step of tour.steps) {
    expect(step.title.length).toBeGreaterThan(4);
    expect(step.body.length).toBeGreaterThan(20);
    expect(PLACEMENTS.has(step.placement), step.id).toBe(true);
  }
}

describe("student tour vocabulary", () => {
  it("targets real shell destinations, once each", () => {
    assertTour(STUDENT_TOUR, studentNav, ["nav-dashboard", "nav-settings"]);
  });

  it("has readable copy, a valid placement and a stable version", () => {
    expect(STUDENT_TOUR.version).toBe(TOUR_VERSION);
    expect(TOURS.student).toBe(STUDENT_TOUR);
  });
});

describe("workspace tours", () => {
  it("covers every nav group a lead or admin actually sees", () => {
    assertTour(LEAD_TOUR, leadNav);
    assertTour(ADMIN_TOUR, adminNav);
    expect(SHELL_TOURS).toEqual({ student: STUDENT_TOUR, lead: LEAD_TOUR, admin: ADMIN_TOUR });
    expect(tourForArea("lead")).toBe(LEAD_TOUR);
    expect(tourForArea("admin")).toBe(ADMIN_TOUR);
    expect(tourForArea("public")).toBeNull();
  });

  it("keeps the lead tour shorter than the menu it explains", () => {
    expect(LEAD_TOUR.steps.length).toBeLessThan(leadNav.length);
    expect(ADMIN_TOUR.steps.length).toBe(adminNav.length);
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
