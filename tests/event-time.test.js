import { describe, expect, it } from "vitest";
import {
  EVENT_TIME_ZONE_LABEL,
  eventTimeParts,
  formatEventTime,
  formatEventTimeRange,
  startsAtLabel,
  formatEventWhen,
  eventDayLabel
} from "@/lib/event-time";

// 04:30Z is 10:00 in Asia/Kolkata (UTC+5:30); 10:30Z is 16:00.
const START = "2026-04-29T04:30:00.000Z";
const END = "2026-04-29T10:30:00.000Z";
const PM_START = "2026-04-29T10:30:00.000Z";

describe("eventTimeParts", () => {
  it("splits an instant into a short day, clock, and lowercase meridiem", () => {
    expect(eventTimeParts(START)).toEqual({ day: "Wed, 29 Apr", clock: "10:00", meridiem: "am" });
    expect(eventTimeParts(PM_START).meridiem).toBe("pm");
  });

  it("returns null for an unparseable value", () => {
    expect(eventTimeParts("not a date")).toBeNull();
    expect(eventTimeParts(null)).toBeNull();
  });
});

describe("formatEventTime", () => {
  it("prints a lowercase meridiem", () => {
    expect(formatEventTime(START)).toBe("10:00 am IST");
    expect(formatEventTime(PM_START)).toBe("4:00 pm IST");
  });

  it("never prints an uppercase meridiem", () => {
    expect(formatEventTime(START)).not.toMatch(/[AP]M/);
    expect(formatEventTime(PM_START)).not.toMatch(/[AP]M/);
  });

  it("always carries the chapter timezone label", () => {
    expect(formatEventTime(START)).toContain("IST");
    expect(EVENT_TIME_ZONE_LABEL).toBe("IST");
  });
});

describe("formatEventTimeRange", () => {
  it("joins two times with an en dash and one zone label", () => {
    expect(formatEventTimeRange(START, END)).toBe("10:00 am – 4:00 pm IST");
    expect(formatEventTimeRange(START, END)).toContain("–");
    expect(formatEventTimeRange(START, END)).not.toContain(" - ");
  });

  it("falls back to a single time when the end is missing", () => {
    expect(formatEventTimeRange(START, null)).toBe("10:00 am IST");
  });

  it("returns an empty string when the start is unparseable", () => {
    expect(formatEventTimeRange("nope", END)).toBe("");
  });
});

describe("startsAtLabel", () => {
  it("puts the day before the time", () => {
    expect(startsAtLabel(START)).toBe("Wed, 29 Apr · 10:00 am IST");
  });
});

describe("formatEventWhen", () => {
  it("is the detail-page WHEN string", () => {
    expect(formatEventWhen(START, END)).toBe("Wed, 29 Apr · 10:00 am – 4:00 pm IST");
  });

  it("can spell the weekday out for member pages", () => {
    expect(formatEventWhen(START, END, { long: true })).toBe("Wednesday, 29 Apr · 10:00 am – 4:00 pm IST");
  });
});

describe("eventDayLabel", () => {
  it("uses the chapter timezone, not the host's", () => {
    // 20:00Z on the 28th is already the 29th in IST.
    expect(eventDayLabel("2026-04-28T20:00:00.000Z")).toBe("Wed, 29 Apr");
  });
});
