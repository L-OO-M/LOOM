import { describe, expect, it, vi } from "vitest";
import {
  CALENDAR_SYNC_AGE_MS,
  CONTRIBUTION_DAYS,
  calendarSyncDue,
  fetchContributionCalendar,
  normalizeContributionCalendar,
  recordContributionCalendar,
  syncContributionCalendar
} from "@/lib/github-contributions";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function sqlClient(handler) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return handler(text, values);
  };
  tag.json = (value) => JSON.stringify(value);
  return { sql: tag, calls };
}

function calendarPayload(days) {
  return {
    data: {
      viewer: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: days.reduce((sum, d) => sum + d.contributionCount, 0),
            weeks: [
              { contributionDays: days.slice(0, 2) },
              { contributionDays: days.slice(2) }
            ]
          }
        }
      }
    }
  };
}

function okFetch(payload) {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
}

/**
 * The grid on /student/github used to be webhook-only, so a member whose hook
 * was installed late saw months of real commits as empty squares. These tests
 * pin the contract that fixes it: one GraphQL read, flattened and deduped, then
 * merged per day with GREATEST so a retry can never inflate activity.
 */
describe("normalizeContributionCalendar", () => {
  it("flattens weeks into sorted days and drops empty ones", () => {
    const days = normalizeContributionCalendar(calendarPayload([
      { date: "2026-11-03", contributionCount: 4 },
      { date: "2026-11-01", contributionCount: 0 },
      { date: "2026-11-02", contributionCount: 1 },
      { date: "2026-11-04", contributionCount: 2 }
    ]));
    expect(days).toEqual([
      { day: "2026-11-02", count: 1 },
      { day: "2026-11-03", count: 4 },
      { day: "2026-11-04", count: 2 }
    ]);
  });

  it("skips malformed entries instead of losing the whole grid", () => {
    const days = normalizeContributionCalendar(calendarPayload([
      { date: "not-a-date", contributionCount: 3 },
      { date: "2026-11-05", contributionCount: "nope" },
      { date: "2026-11-06", contributionCount: -2 },
      { date: "2026-11-07", contributionCount: 2.9 }
    ]));
    expect(days).toEqual([{ day: "2026-11-07", count: 2 }]);
  });

  it("dedupes a day that appears twice", () => {
    const days = normalizeContributionCalendar(calendarPayload([
      { date: "2026-11-08", contributionCount: 1 },
      { date: "2026-11-08", contributionCount: 9 }
    ]));
    expect(days).toEqual([{ day: "2026-11-08", count: 1 }]);
  });

  it("returns an empty list for a missing or broken payload", () => {
    expect(normalizeContributionCalendar(null)).toEqual([]);
    expect(normalizeContributionCalendar({ data: { viewer: null } })).toEqual([]);
    expect(normalizeContributionCalendar({ errors: [{ message: "nope" }] })).toEqual([]);
  });
});

describe("fetchContributionCalendar", () => {
  it("asks for the configured window and reports the total", async () => {
    const fetchImpl = okFetch(calendarPayload([
      { date: "2026-11-01", contributionCount: 3 },
      { date: "2026-11-02", contributionCount: 2 }
    ]));
    const now = Date.parse("2026-11-21T10:00:00Z");
    const result = await fetchContributionCalendar({ accessToken: "tok", now, fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.total).toBe(5);
    expect(result.days).toHaveLength(2);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.query).toContain("contributionsCollection");
    const span = Date.parse(body.variables.to) - Date.parse(body.variables.from);
    expect(Math.round(span / 86_400_000)).toBe(CONTRIBUTION_DAYS - 1);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("never throws when GitHub is unavailable or rejects the token", async () => {
    const throwing = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(fetchContributionCalendar({ accessToken: "tok", fetchImpl: throwing }))
      .resolves.toMatchObject({ ok: false, reason: "UNAVAILABLE" });

    const unauthorized = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(fetchContributionCalendar({ accessToken: "tok", fetchImpl: unauthorized }))
      .resolves.toMatchObject({ ok: false, reason: "HTTP_401" });

    const graphError = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: "read:user missing" }] })
    }));
    await expect(fetchContributionCalendar({ accessToken: "tok", fetchImpl: graphError }))
      .resolves.toMatchObject({ ok: false, reason: "GRAPHQL_ERROR" });

    await expect(fetchContributionCalendar({ accessToken: null }))
      .resolves.toMatchObject({ ok: false, reason: "NO_TOKEN" });
  });
});

describe("recordContributionCalendar", () => {
  it("merges with GREATEST instead of adding", async () => {
    const { sql, calls } = sqlClient(async () => []);
    const written = await recordContributionCalendar({
      sql,
      userId: USER,
      tenantId: TENANT,
      days: [{ day: "2026-11-01", count: 3 }]
    });

    expect(written).toBe(1);
    const insert = calls.find((call) => call.text.includes("INSERT INTO public.student_daily_activity"));
    expect(insert.text).toContain("GREATEST");
    expect(insert.text).toContain("jsonb_to_recordset");
    expect(insert.text).toContain("ON CONFLICT (student_id, day)");
    expect(insert.text).not.toContain("github_contributions + EXCLUDED");
  });

  it("writes nothing for an empty calendar", async () => {
    const { sql, calls } = sqlClient(async () => []);
    expect(await recordContributionCalendar({ sql, userId: USER, tenantId: TENANT, days: [] })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("filters out zero and malformed days before writing", async () => {
    const { sql, calls } = sqlClient(async () => []);
    const written = await recordContributionCalendar({
      sql,
      userId: USER,
      tenantId: TENANT,
      days: [
        { day: "2026-11-01", count: 0 },
        { day: "nope", count: 4 },
        { day: "2026-11-02", count: 2 }
      ]
    });
    expect(written).toBe(1);
    const insert = calls.find((call) => call.text.includes("INSERT INTO public.student_daily_activity"));
    const payload = JSON.parse(insert.values[2]);
    expect(payload).toEqual([{ day: "2026-11-02", count: 2 }]);
  });
});

describe("syncContributionCalendar", () => {  it("stores the calendar and stamps the connection", async () => {
    const { sql, calls } = sqlClient(async (text) => {
      if (text.includes("INSERT INTO public.student_daily_activity")) return [];
      return [];
    });
    const fetchImpl = okFetch(calendarPayload([
      { date: "2026-11-01", contributionCount: 3 }
    ]));
    const result = await syncContributionCalendar({
      sql,
      userId: USER,
      tenantId: TENANT,
      accessToken: "tok",
      now: Date.parse("2026-11-21T10:00:00Z"),
      fetchImpl
    });

    expect(result).toMatchObject({ ok: true, days: 1, total: 3 });
    expect(calls.some((call) => call.text.includes("contributions_synced_at = NOW()"))).toBe(true);
  });

  it("leaves the database untouched when the read fails", async () => {
    const { sql, calls } = sqlClient(async () => []);
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    const result = await syncContributionCalendar({
      sql,
      userId: USER,
      tenantId: TENANT,
      accessToken: "tok",
      fetchImpl
    });

    expect(result).toMatchObject({ ok: false, reason: "HTTP_502", days: 0 });
    expect(calls).toHaveLength(0);
  });

  it("reports a write failure instead of throwing", async () => {
    const { sql } = sqlClient(async (text) => {
      if (text.includes("INSERT INTO public.student_daily_activity")) throw new Error("db down");
      return [];
    });
    const fetchImpl = okFetch(calendarPayload([
      { date: "2026-11-01", contributionCount: 1 }
    ]));
    const result = await syncContributionCalendar({
      sql,
      userId: USER,
      tenantId: TENANT,
      accessToken: "tok",
      fetchImpl
    });
    expect(result).toMatchObject({ ok: false, reason: "WRITE_FAILED" });
  });
});

/**
 * The page may repair an empty grid on its own, but a render must not become a
 * GitHub request every time. Six hours is the bound; a missing or unreadable
 * stamp counts as due, so the first visit after linking always repairs.
 */
describe("calendarSyncDue", () => {
  const now = Date.parse("2026-11-21T10:00:00Z");

  it("is due when the calendar has never been read", () => {
    expect(calendarSyncDue(null, now)).toBe(true);
    expect(calendarSyncDue(undefined, now)).toBe(true);
  });

  it("is not due inside the window", () => {
    expect(calendarSyncDue(new Date(now - 60_000), now)).toBe(false);
    expect(calendarSyncDue(new Date(now - CALENDAR_SYNC_AGE_MS + 1_000).toISOString(), now)).toBe(false);
  });

  it("is due once stale or when the stamp cannot be parsed", () => {
    expect(calendarSyncDue(new Date(now - CALENDAR_SYNC_AGE_MS - 1), now)).toBe(true);
    expect(calendarSyncDue("not-a-date", now)).toBe(true);
  });
});
