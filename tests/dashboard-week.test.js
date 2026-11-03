import { describe, expect, it } from "vitest";
import { startOfWeek, summarizeWeek } from "@/lib/week-activity";

// Tuesday 2026-10-27 local time.
const NOW = new Date(2026, 9, 27, 12, 0, 0);

function row(day, commits = 0, pull_requests = 0, reviews = 0) {
  return { day, commits, pull_requests, reviews };
}

describe("dashboard week window", () => {
  it("anchors on the local Monday of the current week", () => {
    expect(startOfWeek(NOW).getDay()).toBe(1);
    expect(startOfWeek(NOW).getDate()).toBe(26);
    expect(startOfWeek(new Date(2026, 9, 27)).getMonth()).toBe(9);
  });

  it("always renders exactly seven Monday-Sunday days", () => {
    const week = summarizeWeek([], NOW);
    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(week.start).toBe("2026-10-26");
    expect(week.end).toBe("2026-11-01");
  });

  it("ignores activity from outside the calendar week", () => {
    // A row from the previous week (13-day window bug) must not count.
    const week = summarizeWeek(
      [row("2026-10-20", 9, 1, 1), row("2026-10-26", 2, 0, 0)],
      NOW
    );
    expect(week.sessions).toBe(1);
    expect(week.contributions).toBe(2);
    expect(week.days[0]).toMatchObject({ date: "2026-10-26", hit: true, count: 2, today: false });
  });

  it("counts active days, not rows or 13 days of history", () => {
    const week = summarizeWeek(
      [
        row("2026-10-19", 4),
        row("2026-10-20", 3),
        row("2026-10-21", 2),
        row("2026-10-22", 1),
        row("2026-10-23", 5),
        row("2026-10-24", 1),
        row("2026-10-25", 2),
        row("2026-10-26", 1),
        row("2026-10-27", 0, 2, 1),
      ],
      NOW
    );
    expect(week.sessions).toBe(2);
    expect(week.contributions).toBe(4);
  });

  it("marks today even when today has no activity", () => {
    const week = summarizeWeek([row("2026-10-26", 1)], NOW);
    expect(week.days[1]).toMatchObject({ label: "Tue", date: "2026-10-27", today: true, hit: false, count: 0 });
  });

  it("treats future days in the week as quiet, not missing", () => {
    const week = summarizeWeek([], NOW);
    expect(week.days[6]).toMatchObject({ label: "Sun", date: "2026-11-01", hit: false, count: 0 });
  });

  it("accepts Postgres date objects as well as date-only strings", () => {
    const week = summarizeWeek([row(new Date(2026, 9, 26), 0, 0, 3)], NOW);
    expect(week.sessions).toBe(1);
    expect(week.contributions).toBe(3);
  });
});
