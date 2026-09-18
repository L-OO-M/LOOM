import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  VISIBLE_STATUSES,
  resolveScope,
  isStudentVisible,
  isPastEvent,
  displayState,
  isFull,
  filterEvents,
  collectDomains,
  nextStepFor
} from "@/lib/events";

const NOW = new Date("2026-09-18T12:00:00Z").getTime();
const upcomingStart = new Date("2026-09-20T12:00:00Z").toISOString();
const recentStart = new Date("2026-09-18T11:00:00Z").toISOString(); // 1h ago: inside live window
const oldStart = new Date("2026-09-10T12:00:00Z").toISOString();

function event(over = {}) {
  return {
    id: "e1",
    status: "upcoming",
    event_type: "workshop",
    domain: "web",
    starts_at: upcomingStart,
    seats_taken: 0,
    capacity: null,
    ...over
  };
}

describe("events scopes and visibility", () => {
  it("resolves only known scopes", () => {
    expect(resolveScope("past")).toBe("past");
    expect(resolveScope("registered")).toBe("registered");
    expect(resolveScope("upcoming")).toBe("upcoming");
    expect(resolveScope("nope")).toBe("upcoming");
    expect(resolveScope(undefined)).toBe("upcoming");
  });

  it("exposes only upcoming/live to students (never proposed/cancelled)", () => {
    expect(VISIBLE_STATUSES).toEqual(["upcoming", "live"]);
    expect(isStudentVisible({ status: "upcoming" })).toBe(true);
    expect(isStudentVisible({ status: "live" })).toBe(true);
    expect(isStudentVisible({ status: "proposed" })).toBe(false);
    expect(isStudentVisible({ status: "cancelled" })).toBe(false);
    expect(isStudentVisible({ status: "past" })).toBe(false);
  });

  it("treats events older than the live window as past", () => {
    expect(isPastEvent(oldStart, NOW)).toBe(true);
    expect(isPastEvent(recentStart, NOW)).toBe(false);
    expect(isPastEvent(upcomingStart, NOW)).toBe(false);
  });
});

describe("events display state", () => {
  it("prioritises attended, then you're-in, over every other state", () => {
    expect(displayState(event(), { status: "attended" }, NOW).key).toBe("attended");
    expect(displayState(event({ seats_taken: 10, capacity: 10 }), { status: "registered" }, NOW).key).toBe("in");
    expect(displayState(event({ starts_at: oldStart }), { status: "registered" }, NOW).key).toBe("in");
  });

  it("marks old events past even when their status column is stale", () => {
    expect(displayState(event({ starts_at: oldStart, status: "upcoming" }), null, NOW).key).toBe("past");
    expect(displayState(event({ status: "past", starts_at: upcomingStart }), null, NOW).key).toBe("past");
  });

  it("marks full only when capacity is set, reached, and the viewer is not in", () => {
    expect(displayState(event({ seats_taken: 10, capacity: 10 }), null, NOW).key).toBe("full");
    expect(displayState(event({ seats_taken: 3, capacity: 10 }), null, NOW).key).toBe("open");
    expect(displayState(event({ seats_taken: 50, capacity: null }), null, NOW).key).toBe("open");
    expect(displayState(event({ status: "live" }), null, NOW).key).toBe("live");
    expect(displayState(event(), { status: "cancelled" }, NOW).key).toBe("open");
  });

  it("computes the register-button full flag", () => {
    expect(isFull(event({ seats_taken: 10, capacity: 10 }), null)).toBe(true);
    expect(isFull(event({ seats_taken: 10, capacity: 10 }), { status: "registered" })).toBe(false);
    expect(isFull(event({ capacity: null, seats_taken: 99 }), null)).toBe(false);
  });
});

describe("events client filtering", () => {
  const rows = [
    event({ id: "a", event_type: "workshop", domain: "web" }),
    event({ id: "b", event_type: "talk", domain: "ai" }),
    event({ id: "c", event_type: "workshop", domain: "ai" })
  ];

  it("filters by type and domain without new queries", () => {
    expect(filterEvents(rows, { type: "all", domain: "all" })).toHaveLength(3);
    expect(filterEvents(rows, { type: "workshop", domain: "all" }).map((e) => e.id)).toEqual(["a", "c"]);
    expect(filterEvents(rows, { type: "all", domain: "ai" }).map((e) => e.id)).toEqual(["b", "c"]);
    expect(filterEvents(rows, { type: "talk", domain: "web" })).toHaveLength(0);
  });

  it("collects sorted unique domains", () => {
    expect(collectDomains(rows)).toEqual(["ai", "web"]);
    expect(collectDomains([])).toEqual([]);
  });

  it("only uses real event types", () => {
    expect(EVENT_TYPES).toEqual(["workshop", "hackathon", "talk", "mentoring", "contest"]);
  });
});

describe("events journey bridges", () => {
  it("points mentoring at mentorship and hackathons at projects", () => {
    expect(nextStepFor(event({ event_type: "mentoring", id: "m1" })).href).toBe("/student/mentorship");
    expect(nextStepFor(event({ event_type: "hackathon", id: "h1" })).href).toBe("/student/projects/new?event=h1");
    expect(nextStepFor(event({ event_type: "contest", id: "c1" })).href).toBe("/student/projects/new?event=c1");
  });

  it("points domain events at the roadmap and generic ones at the forums", () => {
    expect(nextStepFor(event({ event_type: "talk", domain: "ai" })).href).toBe("/student/roadmap?domain=ai");
    expect(nextStepFor(event({ event_type: "talk", domain: "general", id: "t1" })).href).toBe(
      "/student/community/forums?event=t1"
    );
  });
});
