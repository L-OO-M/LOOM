import { describe, expect, it } from "vitest";
import { recentDays, streakFromDays } from "@/lib/momentum";

const TODAY = "2026-11-19";

describe("streakFromDays", () => {
  it("counts consecutive days ending today", () => {
    const result = streakFromDays(["2026-11-17", "2026-11-18", "2026-11-19"], TODAY);
    expect(result).toMatchObject({ current: 3, longest: 3, activeDays: 3 });
  });

  it("does not break the streak before the day is over", () => {
    // Opening the dashboard in the morning with no activity yet must still show
    // yesterday's run, not zero.
    expect(streakFromDays(["2026-11-17", "2026-11-18"], TODAY).current).toBe(2);
    expect(streakFromDays(["2026-11-17", "2026-11-18"], TODAY).longest).toBe(2);
  });

  it("is zero when neither today nor yesterday has activity", () => {
    expect(streakFromDays(["2026-11-10"], TODAY)).toMatchObject({ current: 0, longest: 1 });
  });

  it("finds the longest historical run, not just the current one", () => {
    const days = [
      "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
      "2026-11-18", "2026-11-19"
    ];
    expect(streakFromDays(days, TODAY)).toMatchObject({ current: 2, longest: 4, activeDays: 6 });
  });

  it("dedupes overlapping sources for the same day", () => {
    const result = streakFromDays(["2026-11-19", "2026-11-19T10:00:00.000Z"], TODAY);
    expect(result.current).toBe(1);
    expect(result.activeDays).toBe(1);
  });

  it("returns a stable empty shape", () => {
    expect(streakFromDays([], TODAY)).toEqual({ current: 0, longest: 0, activeDays: 0 });
  });
});

describe("recentDays", () => {
  it("returns the window newest last and marks only real days", () => {
    const days = recentDays(["2026-11-19", "2026-11-17"], { today: TODAY, window: 4 });
    expect(days.map((d) => d.day)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(days.map((d) => d.hit)).toEqual([false, true, false, true]);
  });
});
