import { describe, expect, it } from "vitest";
import {
  DEFAULT_BATCH,
  MAX_ATTEMPTS,
  OUTBOX_HANDLERS,
  claimBatch,
  drainOutbox,
  enqueue,
  pruneOutbox,
  reclaimStale,
  retryDelaySeconds
} from "@/lib/outbox";
import { JOB_NAMES, JOBS } from "@/lib/scheduler";

const TENANT = "22222222-2222-4222-8222-222222222222";

function makeSql(responder) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(responder(text, values, calls) ?? []);
  };
  sql.json = (value) => value;
  return { sql, calls };
}

const row = (overrides = {}) => ({
  id: 1,
  tenant_id: TENANT,
  topic: "notification",
  payload: { userId: "u1", type: "github_merge", title: "Merged" },
  dedupe_key: "github:merge:1",
  status: "processing",
  attempts: 1,
  available_at: "2026-11-03T00:00:00.000Z",
  locked_at: "2026-11-03T00:00:00.000Z",
  last_error: null,
  ...overrides
});

describe("outbox retry schedule", () => {
  it("backs off exponentially and caps at one hour", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(retryDelaySeconds)).toEqual([
      60, 120, 240, 480, 960, 1920, 3600, 3600
    ]);
  });

  it("treats a missing or nonsense attempt count as the first attempt", () => {
    expect(retryDelaySeconds(0)).toBe(60);
    expect(retryDelaySeconds(undefined)).toBe(60);
    expect(retryDelaySeconds("3")).toBe(240);
  });
});

describe("enqueue", () => {
  it("refuses to queue without a tenant or a topic", async () => {
    const { sql } = makeSql(() => []);
    await expect(enqueue(sql, { topic: "notification" })).rejects.toThrow(/tenantId/);
    await expect(enqueue(sql, { tenantId: TENANT })).rejects.toThrow(/topic/);
  });

  it("returns the new id, and null when the dedupe key was already queued", async () => {
    const first = makeSql(() => [{ id: 7 }]);
    await expect(
      enqueue(first.sql, { tenantId: TENANT, topic: "notification", payload: {}, dedupeKey: "k" })
    ).resolves.toBe(7);
    expect(first.calls[0].text).toContain("ON CONFLICT (topic, dedupe_key)");

    const dupe = makeSql(() => []);
    await expect(
      enqueue(dupe.sql, { tenantId: TENANT, topic: "notification", payload: {}, dedupeKey: "k" })
    ).resolves.toBeNull();
  });

  it("defaults available_at to now when no schedule is given", async () => {
    const { sql, calls } = makeSql(() => [{ id: 1 }]);
    await enqueue(sql, { tenantId: TENANT, topic: "notification" });
    expect(calls[0].text).toContain("COALESCE(?::timestamptz, now())");
    expect(calls[0].values).toContain(null);
  });
});

describe("claiming work", () => {
  it("claims with FOR UPDATE SKIP LOCKED so two drains cannot share a row", async () => {
    const { sql, calls } = makeSql(() => []);
    await claimBatch(sql, { limit: 10 });
    expect(calls[0].text).toContain("FOR UPDATE SKIP LOCKED");
    expect(calls[0].text).toContain("status = 'pending'");
    expect(calls[0].values).toContain(10);
  });

  it("counts the attempt at claim time", async () => {
    const { sql, calls } = makeSql(() => []);
    await claimBatch(sql);
    expect(calls[0].text).toContain("attempts = attempts + 1");
    expect(calls[0].values).toContain(DEFAULT_BATCH);
  });

  it("returns rows stuck in processing to the queue", async () => {
    const { sql, calls } = makeSql(() => [{ id: 4 }]);
    const reclaimed = await reclaimStale(sql);
    expect(reclaimed).toHaveLength(1);
    expect(calls[0].text).toContain("status = 'processing'");
    expect(calls[0].values).toContain(5);
  });
});

describe("drainOutbox", () => {
  function drainResponder(claimed, overrides = {}) {
    return (text) => {
      if (/^UPDATE outbox SET status = 'processing'/.test(text)) return claimed;
      if (/^INSERT INTO notifications/.test(text)) return overrides.notification ? overrides.notification() : [];
      return [];
    };
  }

  it("delivers a notification and marks the row done", async () => {
    const { sql, calls } = makeSql(drainResponder([row()]));
    const summary = await drainOutbox(sql);

    expect(summary).toMatchObject({ claimed: 1, done: 1, retried: 0, dead: 0 });
    const insert = calls.find((c) => /^INSERT INTO notifications/.test(c.text));
    expect(insert.values).toContain("u1");
    expect(insert.values).toContain("github:merge:1");
    expect(calls.some((c) => /^UPDATE outbox SET status = 'done'/.test(c.text))).toBe(true);
  });

  it("reschedules a failed row instead of dropping it", async () => {
    const { sql, calls } = makeSql(
      drainResponder([row({ attempts: 3 })], {
        notification: () => {
          throw new Error("connection reset");
        }
      })
    );

    const summary = await drainOutbox(sql);
    expect(summary).toMatchObject({ claimed: 1, done: 0, retried: 1, dead: 0 });

    const retry = calls.find((c) => /last_error/.test(c.text) && /available_at/.test(c.text));
    expect(retry.text).toContain("make_interval(secs => ?)");
    expect(retry.values).toContain(240);
    expect(retry.values).toContain("connection reset");
  });

  it("dead-letters a row that exhausts its attempts, keeping the error", async () => {
    const { sql, calls } = makeSql(
      drainResponder([row({ attempts: MAX_ATTEMPTS })], {
        notification: () => {
          throw new Error("permanent failure");
        }
      })
    );

    const summary = await drainOutbox(sql);
    expect(summary).toMatchObject({ done: 0, retried: 0, dead: 1 });
    const dead = calls.find((c) => /SET status = 'dead'/.test(c.text));
    expect(dead).toBeTruthy();
    expect(dead.values).toContain("permanent failure");
  });

  it("dead-letters an unknown topic rather than retrying it forever", async () => {
    const { sql, calls } = makeSql(drainResponder([row({ topic: "not-a-topic" })]));
    const summary = await drainOutbox(sql);

    expect(summary.dead).toBe(1);
    const dead = calls.find((c) => /SET status = 'dead'/.test(c.text));
    expect(dead.values.join(" ")).toContain("no handler for topic");
  });

  it("does nothing when the queue is empty", async () => {
    const { sql } = makeSql(() => []);
    await expect(drainOutbox(sql)).resolves.toMatchObject({ claimed: 0, done: 0 });
  });
});

describe("notification handler", () => {
  it("rejects a payload missing its required fields", async () => {
    const { sql } = makeSql(() => []);
    await expect(
      OUTBOX_HANDLERS.notification(sql, row({ payload: { userId: "u1" } }))
    ).rejects.toThrow(/requires userId, type and title/);
  });
});

describe("pruneOutbox", () => {
  it("skips cleanly before migration 066 has run", async () => {
    const { sql } = makeSql(() => []);
    await expect(pruneOutbox(sql)).resolves.toEqual({ skipped: true });
  });

  it("keeps dead rows longer than delivered ones", async () => {
    const { sql, calls } = makeSql((text) => {
      if (/information_schema\.tables/.test(text)) return [{ "?column?": 1 }];
      return [{ id: 1 }];
    });
    const result = await pruneOutbox(sql);

    expect(result).toMatchObject({ done: 1, dead: 1, doneDays: 7, deadDays: 30 });
    const done = calls.find((c) => /status = 'done'/.test(c.text));
    const dead = calls.find((c) => /status = 'dead'/.test(c.text));
    expect(done.values).toContain(7);
    expect(dead.values).toContain(30);
  });
});

describe("scheduler wiring", () => {
  it("exposes the drain as a job you can call by name", () => {
    expect(JOB_NAMES).toContain("outbox-drain");
    expect(typeof JOBS["outbox-drain"]).toBe("function");
  });

  it("runs the drain last so earlier jobs still deliver their events", () => {
    expect(JOB_NAMES[JOB_NAMES.length - 1]).toBe("outbox-drain");
  });
});
