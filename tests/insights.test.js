import { describe, expect, it } from "vitest";
import {
  INSIGHT_TONES,
  adminInsights,
  leadInsights,
  studentInsights,
  topInsights
} from "@/lib/insights";

// The engine's contract is "a card, or nothing". These tests pin the two ways
// that can go wrong: inventing a reading when there is no data, and burying the
// urgent card under a positive one.

const ids = (cards) => cards.map((c) => c.id);

describe("insight cards are evidence-shaped", () => {
  it("never invents a card when no metrics exist", () => {
    expect(studentInsights()).toEqual([]);
    expect(studentInsights({})).toEqual([]);
    expect(leadInsights()).toEqual([]);
    expect(leadInsights({ queue: { items: [] }, overview: { roster: [], departments: [], charts: {} } })).toEqual([]);
    expect(adminInsights()).toEqual([]);
    expect(adminInsights({ queue: { items: [] }, analytics: {} })).toEqual([]);
  });

  it("uses a known tone, a title, a body, and only internal links", () => {
    const cards = studentInsights({
      overdueWork: 2,
      provisionalNodes: 1,
      coreSeats: ["Web"],
      reviewQueue: 3,
      mentees: 2
    });
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(INSIGHT_TONES).toContain(card.tone);
      expect(card.title.length).toBeGreaterThan(10);
      expect(card.body.length).toBeGreaterThan(20);
      if (card.action) expect(card.action.href.startsWith("/")).toBe(true);
    }
  });
});

describe("studentInsights", () => {
  it("puts overdue work above everything else", () => {
    const cards = studentInsights({ overdueWork: 2, mentees: 3, mentorSessions: 4 });
    expect(cards[0].id).toBe("work-overdue");
    expect(cards[0].tone).toBe("risk");
    expect(cards[0].action.href).toBe("/student/work");
    expect(cards.some((c) => c.tone === "win")).toBe(true);
  });

  it("separates a quiet week from a quiet fortnight", () => {
    expect(ids(studentInsights({ daysSinceActive: 7 }))).toContain("quiet-week");
    expect(ids(studentInsights({ daysSinceActive: 7 }))).not.toContain("quiet-fortnight");
    expect(ids(studentInsights({ daysSinceActive: 20 }))).toContain("quiet-fortnight");
    // null means "no activity was ever recorded" — not "zero days since".
    expect(ids(studentInsights({ daysSinceActive: null }))).not.toContain("quiet-week");
  });

  it("asks for verification only when a claim exists", () => {
    expect(ids(studentInsights({ nodesTotal: 40, roadmapPct: 20, provisionalNodes: 0 })))
      .not.toContain("claims-unverified");
    expect(ids(studentInsights({ nodesTotal: 40, roadmapPct: 20, provisionalNodes: 2 })))
      .toContain("claims-unverified");
  });

  it("reads a Core seat as a review responsibility", () => {
    const busy = studentInsights({ coreSeats: ["Web"], reviewQueue: 4 });
    expect(ids(busy)).toContain("core-review-queue");
    expect(busy.find((c) => c.id === "core-review-queue").title).toContain("Web");

    const clear = studentInsights({ coreSeats: ["Web"], reviewQueue: 0 });
    expect(ids(clear)).toContain("core-review-clear");
    expect(ids(clear)).not.toContain("core-review-queue");
  });

  it("compares consistency with peers only when there are peers", () => {
    expect(ids(studentInsights({ consistency: 20, peerConsistency: 60, peerCount: 1 })))
      .not.toContain("consistency-behind");
    expect(ids(studentInsights({ consistency: 20, peerConsistency: 60, peerCount: 12 })))
      .toContain("consistency-behind");
  });

  it("does not compare a member who has no rollup against peers", () => {
    // null is "not recorded yet", not "0% consistent". Telling a member who has
    // never been synced that they are behind their peers is a fabricated claim.
    expect(ids(studentInsights({ consistency: null, peerConsistency: 60, peerCount: 12 })))
      .not.toContain("consistency-behind");
  });

  it("uses attendance over registration alone", () => {
    expect(ids(studentInsights({ eventsRegistered: 4, eventsAttended: 0 }))).toContain("events-no-show");
    expect(ids(studentInsights({ eventsRegistered: 4, eventsAttended: 3 }))).toContain("events-turnout");
    expect(ids(studentInsights({ eventsRegistered: 1, eventsAttended: 0 }))).not.toContain("events-no-show");
  });
});

describe("leadInsights", () => {
  const queue = (items) => ({ items });

  it("flags overdue and unowned work before anything positive", () => {
    const cards = leadInsights({
      queue: queue([
        { key: "overdue_work", count: 3, waitingDays: 4, href: "/lead/departments" },
        { key: "unassigned_work", count: 2, waitingDays: 1, href: "/lead/departments" }
      ]),
      overview: { roster: [{ user_id: "a" }], departments: [], charts: {} }
    });
    expect(cards[0].tone).toBe("risk");
    expect(ids(cards).slice(0, 2).sort()).toEqual(["dept-overdue", "dept-unowned"]);
  });

  it("turns request age into copy, not just a number", () => {
    const cards = leadInsights({
      queue: queue([{ key: "seat_requests", count: 2, waitingDays: 9, href: "/lead/roster" }]),
      overview: { roster: [], departments: [], charts: {} }
    });
    const seat = cards.find((c) => c.id === "dept-seat-requests");
    expect(seat.body).toContain("9 days");
    expect(seat.action.href).toBe("/lead/roster");
  });

  it("does not call a clear scope healthy when there are no members", () => {
    const cards = leadInsights({
      queue: queue([]),
      overview: { roster: [], departments: [], charts: {} }
    });
    expect(ids(cards)).not.toContain("dept-all-clear");
  });

  it("says the scope is clear only after real members exist", () => {
    const cards = leadInsights({
      queue: queue([]),
      overview: { roster: [{ user_id: "a" }], departments: [{ members: 1, succession_ready: 1 }], charts: {} }
    });
    expect(ids(cards)).toContain("dept-all-clear");
  });

  it("reads turnout in both directions", () => {
    const low = leadInsights({
      queue: queue([]),
      overview: { roster: [{ user_id: "a" }], departments: [{ members: 1, succession_ready: 1 }], charts: { turnoutPct: 30 } }
    });
    expect(low.find((c) => c.id === "dept-turnout-low").tone).toBe("watch");

    const high = leadInsights({
      queue: queue([]),
      overview: { roster: [{ user_id: "a" }], departments: [{ members: 1, succession_ready: 1 }], charts: { turnoutPct: 82 } }
    });
    expect(high.find((c) => c.id === "dept-turnout-high").tone).toBe("win");
  });
});

describe("adminInsights", () => {
  const queue = (items) => ({ items });

  it("escalates a chapter that is mostly inactive", () => {
    const cards = adminInsights({
      queue: queue([]),
      analytics: { health: { total_students: 100, active_students_7d: 20 } }
    });
    expect(cards[0].id).toBe("chapter-activation-low");
    expect(cards[0].tone).toBe("risk");
  });

  it("compares the last week with the week before", () => {
    const history = [
      { active_students_7d: 40 }, { active_students_7d: 42 }, { active_students_7d: 41 },
      { active_students_7d: 40 }, { active_students_7d: 39 }, { active_students_7d: 40 }, { active_students_7d: 41 },
      { active_students_7d: 80 }, { active_students_7d: 78 }, { active_students_7d: 80 },
      { active_students_7d: 79 }, { active_students_7d: 81 }, { active_students_7d: 80 }, { active_students_7d: 80 }
    ];
    const cards = adminInsights({ queue: queue([]), analytics: { health: null, history } });
    expect(ids(cards)).toContain("chapter-activity-falling");
    expect(cards.find((c) => c.id === "chapter-activity-falling").body).toContain("down from");
  });

  it("names the node where the chapter stalls", () => {
    const cards = adminInsights({
      queue: queue([]),
      analytics: {
        health: { total_students: 50, active_students_7d: 40 },
        bottlenecks: [
          { title: "Arrays", drop_off_pct: 81, total_started: 40, total_completed: 8 },
          { title: "Graphs", drop_off_pct: 20, total_started: 40, total_completed: 32 }
        ]
      }
    });
    const node = cards.find((c) => c.id === "chapter-bottleneck");
    expect(node.title).toContain("Arrays");
    expect(node.metric).toContain("81");
  });

  it("does not claim an all-clear for an empty chapter", () => {
    expect(ids(adminInsights({ queue: queue([]), analytics: { health: { total_students: 0 } } })))
      .not.toContain("chapter-all-clear");
  });
});

describe("topInsights", () => {
  it("orders by urgency, then weight, and respects the limit", () => {
    const cards = [
      { id: "a", tone: "win", weight: 900 },
      { id: "b", tone: "watch", weight: 1 },
      { id: "c", tone: "risk", weight: 2 },
      { id: "d", tone: "watch", weight: 50 }
    ];
    expect(topInsights(cards, 2).map((c) => c.id)).toEqual(["c", "d"]);
    expect(topInsights(cards, 0)).toEqual([]);
    expect(topInsights(cards).map((c) => c.tone)).toEqual(["risk", "watch", "watch", "win"]);
  });
});
