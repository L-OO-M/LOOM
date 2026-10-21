import { describe, expect, it } from "vitest";
import {
  addDays,
  buildCalendarItems,
  filterSessions,
  formatWeekRange,
  isDeferred,
  isRelaxationDate,
  plannerAlerts,
  PLANNER_RELAXATION_END,
  PLANNER_RELAXATION_START,
  sessionDate,
  toIcs,
  trackLabel,
} from "@/lib/planner";
import { loadAssignableLeads, loadPlannerOwners } from "@/lib/planner-data";

function recorder(results) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(results.shift() ?? []);
  };
  sql.calls = calls;
  return sql;
}

const weeks = [
  {
    id: "w5", week_number: 5, starts_on: "2026-11-16", ends_on: "2026-11-22",
    theme: "JavaScript week", delivery_mode: "live", is_relaxation: false, is_protected: false, notes: "",
  },
  {
    id: "w6", week_number: 6, starts_on: "2026-11-23", ends_on: "2026-11-29",
    theme: "Relaxation", delivery_mode: "deferred", is_relaxation: true, is_protected: false, notes: "",
  },
];

const sessions = [
  {
    id: "s1", week_number: 5, track_domain: "dsa", curriculum_ref: "D05", title: "Sliding window",
    session_kind: "clinic", day_of_week: 1, starts_time: "17:00:00", ends_time: "17:45:00",
    delivery_mode: "live", is_required: true, is_relaxation: false, notes: "",
  },
  {
    id: "s2", week_number: 6, track_domain: "dsa", curriculum_ref: "D06", title: "Binary search",
    session_kind: "clinic", day_of_week: 1, starts_time: "17:00:00", ends_time: "17:45:00",
    delivery_mode: "deferred", is_required: true, is_relaxation: true, notes: "",
  },
  {
    id: "s3", week_number: 5, track_domain: "web", curriculum_ref: "W07", title: "Figma for developers",
    session_kind: "workshop", day_of_week: 4, starts_time: "17:00:00", ends_time: "19:00:00",
    delivery_mode: "live", is_required: true, is_relaxation: false, notes: "",
  },
];

const events = [
  {
    id: "e1", title: "LOOM annual Demo Day", description: "One combined showcase",
    event_type: "talk", planner_kind: "showcase", planner_ref: "DEMODAY", planner_week: 28,
    starts_at: "2027-04-29T04:30:00.000Z", ends_at: "2027-04-29T10:30:00.000Z", location: "Hall",
  },
];

describe("planner date model", () => {
  it("adds days UTC-safely across month boundaries", () => {
    expect(addDays("2026-11-16", 6)).toBe("2026-11-22");
    expect(addDays("2026-12-28", 6)).toBe("2027-01-03");
  });

  it("derives the session date from the week's Monday plus day_of_week", () => {
    expect(sessionDate(weeks[0], sessions[0])).toBe("2026-11-16");
    expect(sessionDate(weeks[0], sessions[2])).toBe("2026-11-19");
    expect(sessionDate(weeks[0], { day_of_week: null })).toBe(null);
  });

  it("marks the 20 Nov – 20 Dec window boundaries exactly", () => {
    expect(isRelaxationDate("2026-11-19")).toBe(false);
    expect(isRelaxationDate(PLANNER_RELAXATION_START)).toBe(true);
    expect(isRelaxationDate(PLANNER_RELAXATION_END)).toBe(true);
    expect(isRelaxationDate("2026-12-21")).toBe(false);
  });
});

describe("deferred sessions", () => {
  it("treats an in-window date or an explicit deferred mode as deferred", () => {
    expect(isDeferred(weeks[0], sessions[0])).toBe(false);
    expect(isDeferred(weeks[1], sessions[1])).toBe(true);
    // A live row inside the window is still deferred by date.
    expect(isDeferred(weeks[1], { ...sessions[1], delivery_mode: "live" })).toBe(true);
  });

  it("filters by track and keeps every session for all", () => {
    expect(filterSessions(sessions, "dsa").map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(filterSessions(sessions, "all")).toHaveLength(3);
  });
});

describe("calendar merge", () => {
  const items = buildCalendarItems({ weeks, sessions, events });

  it("dates sessions, flags deferred rows, and merges society events", () => {
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ id: "s1", date: "2026-11-16", deferred: false, track: "dsa" });
    const deferred = items.find((i) => i.id === "s2");
    expect(deferred).toMatchObject({ date: "2026-11-23", deferred: true, deliveryMode: "deferred" });
    expect(items.at(-1)).toMatchObject({ id: "e1", kind: "event", date: "2027-04-29" });
  });

  it("formats a week range", () => {
    expect(formatWeekRange(weeks[0])).toBe("16 Nov 2026 – 22 Nov 2026");
  });
});

describe("planner alerts", () => {
  const items = buildCalendarItems({ weeks, sessions, events });

  it("counts down before the window", () => {
    const alert = plannerAlerts({ weeks, items, now: new Date("2026-11-10T00:00:00Z") }).relaxation;
    expect(alert.upcoming).toBe(true);
    expect(alert.active).toBe(false);
    expect(alert.daysUntil).toBe(10);
  });

  it("reports active inside the window and ended after it", () => {
    expect(plannerAlerts({ weeks, items, now: new Date("2026-11-25T00:00:00Z") }).relaxation.active).toBe(true);
    const after = plannerAlerts({ weeks, items, now: new Date("2026-12-25T00:00:00Z") }).relaxation;
    expect(after.active).toBe(false);
    expect(after.upcoming).toBe(false);
  });

  it("picks the next non-deferred item", () => {
    const next = plannerAlerts({ weeks, items, now: new Date("2026-11-10T00:00:00Z") }).next;
    expect(next.id).toBe("s1");
  });
});

describe("ICS export", () => {
  const ics = toIcs({ weeks, sessions, events, track: "all" });

  it("is a valid calendar with the IST timezone", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("TZID:Asia/Kolkata");
    expect(ics).toContain("DTSTART;TZID=Asia/Kolkata:20261116T170000");
  });

  it("includes live sessions and society events but never deferred ones", () => {
    expect(ics).toContain("D05 Sliding window");
    expect(ics).toContain("LOOM annual Demo Day");
    expect(ics).not.toContain("Binary search");
  });
});

describe("track labels", () => {
  it("names known wings, society and unknown keys", () => {
    expect(trackLabel("cybersecurity")).toBe("Cybersecurity");
    expect(trackLabel("general")).toBe("Society");
    expect(trackLabel(null)).toBe("Society");
  });
});

describe("planner ownership", () => {
  it("counts sessions per owner and keeps the unassigned bucket", async () => {
    const sql = recorder([[
      { user_id: "u1", name: "Asha Rao", role: "dept_lead", sessions: 12 },
      { user_id: null, name: null, role: null, sessions: 3 },
    ]]);
    const owners = await loadPlannerOwners({ sql, tenantId: "tenant-1" });
    expect(owners[0]).toEqual({ user_id: "u1", name: "Asha Rao", role: "dept_lead", sessions: 12 });
    expect(owners[1]).toMatchObject({ user_id: null, sessions: 3 });
    expect(sql.calls[0].values).toContain("tenant-1");
    expect(sql.calls[0].text).toContain("owner_user_id");
  });

  it("offers only lead-and-above accounts in this chapter as successors", async () => {
    const sql = recorder([[]]);
    await loadAssignableLeads({ sql, tenantId: "tenant-1" });
    const { text, values } = sql.calls[0];
    expect(values).toContain("tenant-1");
    expect(text).toContain("role IN");
    expect(text).not.toContain("'student'");
  });
});
