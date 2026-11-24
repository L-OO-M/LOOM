import { describe, expect, it } from "vitest";
import {
  HARD_TO_REACH_RATIO,
  dailySeries,
  dayWindow,
  formatCount,
  hardToReach,
  summarizeRoutes,
  tourReport,
  usageInsights
} from "@/lib/usage";

const rows = [
  { day: "2026-11-20", area: "student", path: "/student", views: 40, visitors: 20, signed_in: 38, sessions: 22 },
  { day: "2026-11-21", area: "student", path: "/student", views: 60, visitors: 30, signed_in: 55, sessions: 28 },
  { day: "2026-11-21", area: "student", path: "/student/roadmap", views: 10, visitors: 8, signed_in: 10, sessions: 9 },
  { day: "2026-11-21", area: "admin", path: "/admin", views: 5, visitors: 2, signed_in: 5, sessions: 3 }
];

describe("usage route summary", () => {
  it("merges days per route and reports shares against total views", () => {
    const report = summarizeRoutes(rows);
    expect(report.totals.views).toBe(115);
    expect(report.totals.signedIn).toBe(108);
    expect(report.totals.signedInShare).toBe(93.9);
    expect(report.routes[0]).toMatchObject({ path: "/student", area: "student", views: 100, share: 87 });
    expect(report.most).toHaveLength(3);
    expect(report.least.map((entry) => entry.path)).toEqual(["/admin", "/student/roadmap", "/student"]);
  });

  it("never presents a chapter-wide visitor total", () => {
    const report = summarizeRoutes(rows);
    expect(report.totals.visitors).toBeUndefined();
  });

  it("survives empty input", () => {
    const report = summarizeRoutes([]);
    expect(report.routes).toEqual([]);
    expect(report.totals).toMatchObject({ views: 0, signedInShare: 0, routes: 0 });
  });
});

describe("daily series", () => {
  it("orders days oldest first and sums areas", () => {
    expect(dailySeries(rows)).toEqual([
      { day: "2026-11-20", student: 40, total: 40 },
      { day: "2026-11-21", student: 70, admin: 5, total: 75 }
    ]);
  });
});

describe("tour funnel", () => {
  const tourRows = [
    { tour: "student", version: 1, started: 4, completed: 1, skipped: 1, steps: [{ step: 1, id: "home", reached: 4 }, { step: 2, id: "learn", reached: 1 }] },
    { tour: "student", version: 2, started: 10, completed: 6, skipped: 2, steps: [{ step: 1, id: "home", reached: 10 }, { step: 2, id: "learn", reached: 9 }, { step: 3, id: "build", reached: 4 }] }
  ];

  it("reports the newest version and ignores retired ones", () => {
    const [tour] = tourReport(tourRows);
    expect(tour.version).toBe(2);
    expect(tour.started).toBe(10);
    expect(tour.completionRate).toBe(60);
    expect(tour.skipRate).toBe(20);
    expect(tour.steps.map((step) => step.shareOfStart)).toEqual([100, 90, 40]);
    expect(tour.biggestDrop).toMatchObject({ from: 2, to: 3, lost: 5, dropPct: 55.6 });
  });

  it("sums the same version across days", () => {
    const [tour] = tourReport([
      { tour: "student", version: 2, started: 5, completed: 2, skipped: 1, steps: [{ step: 1, id: "home", reached: 5 }] },
      { tour: "student", version: 2, started: 5, completed: 4, skipped: 1, steps: [{ step: 1, id: "home", reached: 5 }] }
    ]);
    expect(tour.started).toBe(10);
    expect(tour.completed).toBe(6);
    expect(tour.steps[0].reached).toBe(10);
  });

  it("returns nothing for no events", () => {
    expect(tourReport([])).toEqual([]);
  });
});

describe("hard to reach", () => {
  const slots = [
    { id: "student-home", label: "Home", path: "/student", area: "student" },
    { id: "student-learn", label: "Learn", path: "/student/roadmap", area: "student" },
    { id: "student-settings", label: "Settings", path: "/student/settings", area: "student" }
  ];

  it("flags a promoted route below the ratio and reports the denominator", () => {
    const report = summarizeRoutes(rows);
    const gaps = hardToReach(slots, report.routes);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ label: "Settings", views: 0, topViews: 100, shareOfTop: 0 });
    expect(HARD_TO_REACH_RATIO).toBe(0.05);
  });

  it("says nothing when the area has no traffic", () => {
    expect(hardToReach(slots, [])).toEqual([]);
  });
});

describe("usage insight cards", () => {
  it("prints the denominator in each claim it makes", () => {
    const report = summarizeRoutes(rows);
    const cards = usageInsights({
      routes: report,
      tours: tourReport([
        { tour: "student", version: 1, started: 20, completed: 4, skipped: 10, steps: [{ step: 1, id: "home", reached: 20 }, { step: 2, id: "learn", reached: 5 }] }
      ]),
      unreachable: hardToReach([{ id: "s", label: "Settings", path: "/student/settings", area: "student" }], report.routes)
    });
    const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
    expect(byId["usage-top-route"].body).toContain("100 of 115 page views");
    expect(byId["usage-tour-drop"].title).toContain("75%");
    expect(byId["usage-tour-completion-low"].title).toContain("20%");
    expect(byId["usage-hard-to-reach"].title).toBe("Settings is hard to reach");
    for (const card of cards) {
      expect(["risk", "watch", "next", "win"]).toContain(card.tone);
      expect(typeof card.weight).toBe("number");
    }
  });

  it("says nothing when there is nothing to say", () => {
    expect(usageInsights({ routes: summarizeRoutes([]), tours: [], unreachable: [] })).toEqual([]);
  });
});

describe("day window", () => {
  it("returns complete UTC days, oldest first, never today", () => {
    const now = new Date("2026-11-24T10:00:00.000Z");
    expect(dayWindow(now, 1)).toEqual(["2026-11-23"]);
    expect(dayWindow(now, 3)).toEqual(["2026-11-21", "2026-11-22", "2026-11-23"]);
  });

  it("clamps a silly window and formats counts", () => {
    const now = new Date("2026-11-24T10:00:00.000Z");
    expect(dayWindow(now, 0)).toHaveLength(1);
    expect(dayWindow(now, 5000)).toHaveLength(180);
    expect(formatCount(12345)).toBe("12,345");
  });
});
