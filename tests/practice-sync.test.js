import { describe, expect, it, vi } from "vitest";
import { DAY_MS } from "@/lib/practice-domain";
import { syncConnection, syncDueConnections } from "@/lib/practice-sync";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const QUESTION = "33333333-3333-4333-8333-333333333333";

function sqlClient(handler) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return handler(text, values);
  };
  tag.begin = async (fn) => fn(tag);
  tag.json = (value) => value;
  return { sql: tag, calls };
}

function graphqlPayload(acceptedAt) {
  return {
    data: {
      matchedUser: {
        username: "student",
        profile: { ranking: 48213, reputation: 12 },
        submitStats: {
          acSubmissionNum: [
            { difficulty: "All", count: 42 },
            { difficulty: "Easy", count: 20 },
            { difficulty: "Medium", count: 18 },
            { difficulty: "Hard", count: 4 }
          ],
          totalSubmissionNum: [
            { difficulty: "All", count: 3200 },
            { difficulty: "Easy", count: 850 },
            { difficulty: "Medium", count: 1700 },
            { difficulty: "Hard", count: 650 }
          ]
        },
        userCalendar: { streak: 3, totalActiveDays: 9, submissionCalendar: "{}" }
      },
      recentAcSubmissionList: [
        { id: "2195305747", titleSlug: "two-sum", timestamp: String(Math.floor(acceptedAt / 1000)) }
      ]
    }
  };
}

function okFetch(acceptedAt) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => graphqlPayload(acceptedAt)
  }));
}

function syncHandler(now, question) {
  return async (text) => {
    if (text.includes("INSERT INTO practice_sync_runs")) return [{ id: "run-1" }];
    if (text.includes("UPDATE practice_connections") && text.includes("RETURNING *")) {
      return [{
        tenant_id: TENANT,
        user_id: USER,
        leetcode_username: "student",
        failures: 0,
        last_sync_at: null,
        next_sync_at: new Date(now - 60_000),
        lease_until: new Date(0),
        active: true
      }];
    }
    if (text.includes("FROM practice_questions q")) return [question];
    if (text.includes("INSERT INTO practice_solves")) return [];
    if (text.includes("INSERT INTO ranking_events")) return [{ id: "event-1" }];
    return [];
  };
}

describe("practice sync cooldown", () => {
  it("does not let a manual refresh bypass the stored backoff", async () => {
    const { sql, calls } = sqlClient(async (text) => {
      if (text.includes("INSERT INTO practice_sync_runs")) return [{ id: "run-1" }];
      return [];
    });

    const result = await syncConnection(sql, {
      tenantId: TENANT,
      userId: USER,
      manual: true,
      now: Date.now()
    });

    expect(result.status).toBe("skipped");
    const claim = calls.find((call) => call.text.includes("UPDATE practice_connections"));
    expect(claim.text).toMatch(/next_sync_at <=/);
  });
});

describe("automatic practice sync", () => {
  it("does not write an empty run row on every minute tick", async () => {
    const now = Date.now();
    const { sql, calls } = sqlClient(async (text) => {
      if (text.includes("SELECT *") && text.includes("FROM practice_connections")) return [];
      if (text.includes("SELECT DISTINCT tenant_id")) {
        return [{ tenant_id: TENANT }];
      }
      if (text.includes("SELECT completed_at")) {
        return [{ completed_at: new Date(now - 60_000) }];
      }
      return [];
    });

    const result = await syncDueConnections(sql, { now });

    expect(result).toMatchObject({ checked: 0, runsStarted: 0, remainingDue: 0 });
    expect(calls.some((call) => call.text.includes("INSERT INTO practice_sync_runs"))).toBe(false);
  });
});

describe("practice sync stats", () => {
  it("persists the LeetCode snapshot on the same write that records the sync", async () => {
    const now = Date.now();
    const acceptedAt = now - 60_000;
    const question = {
      id: QUESTION,
      week_id: "44444444-4444-4444-8444-444444444444",
      title: "Two Sum",
      status: "scheduled",
      start_at: new Date(now - 2 * DAY_MS),
      end_at: new Date(now + 2 * DAY_MS),
      correction_id: null
    };
    const { sql, calls } = sqlClient(syncHandler(now, question));

    const result = await syncConnection(sql, {
      tenantId: TENANT,
      userId: USER,
      now,
      fetchImpl: okFetch(acceptedAt)
    });

    expect(result).toMatchObject({
      status: "ready",
      received: 1,
      matched: 1,
      credited: 1,
      stats: { total: 42, easy: 20, medium: 18, hard: 4 }
    });

    const statsWrite = calls.find((call) => call.text.includes("leetcode_stats"));
    expect(statsWrite, "stats are written with the sync").toBeTruthy();
    expect(statsWrite.text).toContain("stats_synced_at");
    // The parameter must be an OBJECT. Passing a pre-stringified value with an
    // explicit `::jsonb` cast double-encodes it into a JSON string, which stored
    // fine but made `leetcode_stats->>'total'` NULL in production.
    expect(
      statsWrite.values.some((value) => value && typeof value === "object" && value.total === 42)
    ).toBe(true);
    expect(
      statsWrite.values.some((value) => typeof value === "string" && value.includes('"total"'))
    ).toBe(false);
    expect(calls.some((call) => call.text.includes("INSERT INTO practice_solves"))).toBe(true);
    expect(calls.some((call) => call.text.includes("INSERT INTO ranking_events"))).toBe(true);
  });

  it("keeps the previous stats when LeetCode fails", async () => {
    const now = Date.now();
    const question = {
      id: QUESTION,
      week_id: "44444444-4444-4444-8444-444444444444",
      title: "Two Sum",
      status: "scheduled",
      start_at: new Date(now - 2 * DAY_MS),
      end_at: new Date(now + 2 * DAY_MS),
      correction_id: null
    };
    const { sql, calls } = sqlClient(syncHandler(now, question));

    const result = await syncConnection(sql, {
      tenantId: TENANT,
      userId: USER,
      now,
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({})
      }))
    });

    expect(result.status).toBe("error");
    expect(result.stats).toBeUndefined();
    expect(calls.some((call) => call.text.includes("leetcode_stats"))).toBe(false);
    expect(calls.some(
      (call) => call.text.includes("UPDATE practice_connections") && call.text.includes("sync_state = 'error'")
    )).toBe(true);
  });
});

describe("solves outside a practice week", () => {
  it("records the solve but does not credit it", async () => {
    const now = Date.now();
    const acceptedAt = now - 60_000;
    // The week is scheduled but closed long before this submission.
    const question = {
      id: QUESTION,
      week_id: "44444444-4444-4444-8444-444444444444",
      title: "Two Sum",
      status: "scheduled",
      start_at: new Date(now - 30 * DAY_MS),
      end_at: new Date(now - 23 * DAY_MS),
      correction_id: null
    };
    const { sql, calls } = sqlClient(syncHandler(now, question));

    const result = await syncConnection(sql, {
      tenantId: TENANT,
      userId: USER,
      now,
      fetchImpl: okFetch(acceptedAt)
    });

    expect(result).toMatchObject({ status: "ready", received: 1, matched: 1, credited: 0 });
    expect(result.message).toContain("recorded but not scored");
    expect(calls.some((call) => call.text.includes("INSERT INTO practice_solves"))).toBe(true);
    expect(calls.some((call) => call.text.includes("INSERT INTO ranking_events"))).toBe(false);
  });

  it("does not throw away a solve whose week is not scheduled", async () => {
    const now = Date.now();
    const acceptedAt = now - 60_000;
    const question = {
      id: QUESTION,
      week_id: "44444444-4444-4444-8444-444444444444",
      title: "Two Sum",
      status: "draft",
      start_at: new Date(now - 2 * DAY_MS),
      end_at: new Date(now + 2 * DAY_MS),
      correction_id: null
    };
    const { sql, calls } = sqlClient(syncHandler(now, question));

    const result = await syncConnection(sql, {
      tenantId: TENANT,
      userId: USER,
      now,
      fetchImpl: okFetch(acceptedAt)
    });

    expect(result).toMatchObject({ matched: 1, credited: 0 });
    expect(calls.some((call) => call.text.includes("INSERT INTO practice_solves"))).toBe(true);
    // The lookup must not filter `w.status = 'scheduled'` any more.
    const lookup = calls.find((call) => call.text.includes("FROM practice_questions q"));
    expect(lookup.text).not.toContain("AND w.status = 'scheduled'");
  });
});
