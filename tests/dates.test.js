import { describe, expect, it } from "vitest";
import { relDay, relShort, stamp, todayLong } from "@/lib/dates";

// These labels used to be formatted inside the student dashboard, which is a
// client component and therefore renders twice: once in Node, once in the
// browser. The two processes can sit in different timezones, so the same row
// could read "Today" on the server and "Tomorrow" in the browser -- a hydration
// mismatch (React #418) that silently discards the server HTML. The fix was to
// format on the server and pass strings down, which only stays fixed if the
// boundary rules themselves are pinned.
//
// `now` is injected so the cases do not depend on when the suite runs.
const now = new Date("2026-11-04T09:40:00+05:30");

describe("relDay", () => {
  it("returns an empty label for a missing date", () => {
    expect(relDay(null, now)).toBe("");
    expect(relDay("", now)).toBe("");
  });

  it("treats today and anything already past as Today", () => {
    expect(relDay("2026-11-04T18:00:00+05:30", now)).toBe("Today");
    expect(relDay("2026-11-02T18:00:00+05:30", now)).toBe("Today");
  });

  it("calls the next calendar day Tomorrow", () => {
    expect(relDay("2026-11-05T00:30:00+05:30", now)).toBe("Tomorrow");
  });

  it("uses the weekday name inside the coming week", () => {
    expect(relDay("2026-11-07T10:00:00+05:30", now)).toBe("Saturday");
    // Six days out is the last weekday label; the switch to a calendar date is
    // at seven, and an off-by-one here is exactly the kind of drift that used to
    // differ between server and browser.
    expect(relDay("2026-11-10T10:00:00+05:30", now)).toBe("Tuesday");
    expect(relDay("2026-11-11T10:00:00+05:30", now)).toBe("11 Nov");
  });

  it("falls back to a short calendar date beyond a week", () => {
    expect(relDay("2026-12-05T10:00:00+05:30", now)).toBe("5 Dec");
    expect(relDay("2027-01-30T10:00:00+05:30", now)).toBe("30 Jan");
  });

  it("compares calendar days, not elapsed hours", () => {
    // 23:59 -> 00:01 is two minutes but still Tomorrow.
    expect(relDay("2026-11-05T00:01:00+05:30", new Date("2026-11-04T23:59:00+05:30"))).toBe("Tomorrow");
    // 00:01 -> 23:59 later the same day is still Today.
    expect(relDay("2026-11-04T23:59:00+05:30", new Date("2026-11-04T00:01:00+05:30"))).toBe("Today");
    // A UTC server must still use the Indian calendar: 20:00Z on 4 Nov is
    // 01:30 IST on 5 Nov, so later that IST day is Today, not Tomorrow.
    expect(relDay("2026-11-05T23:30:00+05:30", new Date("2026-11-04T20:00:00Z"))).toBe("Today");
  });
});

describe("relShort", () => {
  it("returns an empty label for a missing date", () => {
    expect(relShort(null)).toBe("");
  });

  it("formats a workshop date as short month and day", () => {
    expect(relShort("2026-12-05T10:00:00+05:30")).toBe("5 Dec");
    expect(relShort("2027-01-30T10:00:00+05:30")).toBe("30 Jan");
  });
});

describe("stamp", () => {
  // Added for the admin audit trail, which used to call toLocaleString() inside
  // the client component and produced the same #418 mismatch as the student
  // dashboard: the audit rows are rendered on the server and hydrated in the
  // browser.
  it("returns an empty label for a missing date", () => {
    expect(stamp(null)).toBe("");
    expect(stamp(undefined)).toBe("");
  });

  it("keeps the IST calendar even when the host process runs in UTC", () => {
    // 15:16Z is 20:46 IST on the same date; a UTC host must not print 3:16 pm.
    const label = stamp("2026-11-17T15:16:00Z");
    expect(label).toContain("17");
    expect(label.toLowerCase()).toContain("8:46");
    expect(label.toLowerCase()).toContain("pm");
  });

  it("rolls to the next IST date after 18:30Z", () => {
    // 19:30Z is 01:00 IST on the 18th.
    const label = stamp("2026-11-17T19:30:00Z");
    expect(label).toContain("18");
    expect(label.toLowerCase()).toContain("1:00");
    expect(label.toLowerCase()).toContain("am");
  });
});

describe("todayLong", () => {
  it("renders the weekday-first masthead label in IST", () => {
    // en-IN puts the day before the month; this is the masthead's actual copy.
    expect(todayLong(new Date("2026-11-17T09:00:00+05:30"))).toBe(
      "Tuesday, 17 November 2026"
    );
  });

  it("uses the IST date, not the UTC date, near midnight UTC", () => {
    // 19:00Z on the 17th is 00:30 IST on the 18th.
    expect(todayLong(new Date("2026-11-17T19:00:00Z"))).toBe(
      "Wednesday, 18 November 2026"
    );
  });
});
