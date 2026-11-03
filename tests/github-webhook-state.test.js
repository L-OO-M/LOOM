import crypto from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  GITHUB_EVENT_MAX_ATTEMPTS,
  classifyGitHubDelivery,
  githubEventNextAttemptAt,
  githubEventRetryDelayMs,
  notifyOnce,
  webhookNotificationKey
} from "@/lib/github";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "student-1";
const SECRET = "webhook-secret-for-tests";

// ---------------------------------------------------------------------------
// Pure retry policy
// ---------------------------------------------------------------------------

describe("GitHub delivery retry policy", () => {
  it("backs off exponentially and then stops growing", () => {
    expect(githubEventRetryDelayMs(1)).toBe(30_000);
    expect(githubEventRetryDelayMs(2)).toBe(60_000);
    expect(githubEventRetryDelayMs(3)).toBe(120_000);
    expect(githubEventRetryDelayMs(99)).toBe(60 * 60 * 1000);
  });

  it("computes a future next-attempt timestamp", () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const next = new Date(githubEventNextAttemptAt(2, now)).getTime();
    expect(next).toBe(now + 60_000);
  });

  it("classifies terminal, owned, and retryable deliveries", () => {
    const now = Date.now();
    expect(classifyGitHubDelivery({ status: "processed" })).toBe("processed");
    expect(classifyGitHubDelivery({ status: "dead" })).toBe("dead");
    expect(classifyGitHubDelivery({ status: "processing", claimed_at: new Date(now).toISOString() }))
      .toBe("in_progress");
    expect(classifyGitHubDelivery({
      status: "processing",
      claimed_at: new Date(now - 6 * 60 * 1000).toISOString()
    })).toBe("retryable");
    expect(classifyGitHubDelivery({
      status: "failed",
      next_attempt: new Date(now + 60_000).toISOString()
    })).toBe("retry_later");
    expect(classifyGitHubDelivery({
      status: "failed",
      next_attempt: new Date(now - 1000).toISOString()
    })).toBe("retryable");
    expect(classifyGitHubDelivery({ status: "pending" })).toBe("retryable");
  });
});

describe("webhook notification keys", () => {
  it("is stable across redeliveries and does not include the delivery id", () => {
    const key = webhookNotificationKey("oss_merge", "https://github.com/org/repo/pull/7");
    expect(key).toBe("github:oss_merge:https://github.com/org/repo/pull/7");
    expect(key).toBe(webhookNotificationKey("oss_merge", "https://github.com/org/repo/pull/7"));
  });

  it("returns null when there is no stable identity", () => {
    expect(webhookNotificationKey()).toBeNull();
    expect(webhookNotificationKey("", null)).toBeNull();
  });
});

describe("notifyOnce", () => {
  it("writes a dedupe key and relies on the partial unique index", async () => {
    const calls = [];
    const sql = (strings, ...values) => {
      calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
      return Promise.resolve([]);
    };

    await notifyOnce({
      sql,
      tenantId: TENANT,
      userId: USER,
      type: "oss_verified",
      title: "PR merged",
      dedupeKey: "github:oss_merge:https://github.com/org/repo/pull/7"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("INSERT INTO notifications");
    expect(calls[0].text).toContain("dedupe_key");
    expect(calls[0].text).toContain("ON CONFLICT (user_id, dedupe_key)");
    expect(calls[0].values).toContain("github:oss_merge:https://github.com/org/repo/pull/7");
  });

  it("refuses to write without a dedupe key", async () => {
    await expect(notifyOnce({
      sql: async () => [],
      tenantId: TENANT,
      userId: USER,
      type: "x",
      title: "x"
    })).rejects.toThrow(/dedupeKey/);
  });
});

// ---------------------------------------------------------------------------
// Route: claim -> fan-out -> processed, and failure -> retry -> resume
// ---------------------------------------------------------------------------

function makeGitHubDb() {
  const events = new Map();
  const activity = { commits: 0, pull_requests: 0, reviews: 0 };
  let failActivityOnce = false;

  const handle = (text, values) => {
    if (/FROM feature_flags/.test(text)) return [{ enabled: true }];
    if (/WITH inserted AS/.test(text)) {
      const key = values[0];
      if (!events.has(key)) {
        events.set(key, {
          idempotency_key: key,
          status: "pending",
          attempts: 0,
          claimed_at: null,
          next_attempt: null,
          activity_applied_at: null,
          last_error: null
        });
      }
      const row = events.get(key);
      const now = Date.now();
      const retryableFailed = row.status === "failed"
        && (!row.next_attempt || new Date(row.next_attempt).getTime() <= now);
      const retryablePending = row.status === "pending";
      const staleProcessing = row.status === "processing"
        && row.claimed_at
        && now - new Date(row.claimed_at).getTime() > 5 * 60 * 1000;
      if (!retryableFailed && !retryablePending && !staleProcessing) return [];
      row.status = "processing";
      row.attempts += 1;
      row.claimed_at = new Date().toISOString();
      row.last_error = null;
      return [{ ...row }];
    }
    if (/SELECT status, claimed_at, next_attempt, attempts/.test(text)) {
      const row = events.get(values[0]);
      return row ? [{ ...row }] : [];
    }
    if (/SELECT DISTINCT user_id FROM github_connections/.test(text)) {
      return [{ user_id: USER }];
    }
    if (/SELECT user_id FROM github_connections/.test(text)) return [{ user_id: USER }];
    if (/SELECT user_id FROM profiles/.test(text)) return [{ user_id: USER }];
    if (/INSERT INTO public.student_daily_activity/.test(text)) {
      if (failActivityOnce) {
        failActivityOnce = false;
        throw new Error("simulated aggregate write failure");
      }
      activity.commits += Number(values[3]) || 0;
      activity.pull_requests += Number(values[4]) || 0;
      activity.reviews += Number(values[5]) || 0;
      return [];
    }
    if (/UPDATE github_events\s+SET activity_applied_at/.test(text) || /SET activity_applied_at/.test(text)) {
      const row = events.get(values[0]);
      if (!row || row.activity_applied_at) return [];
      row.activity_applied_at = new Date().toISOString();
      return [{ idempotency_key: row.idempotency_key }];
    }
    if (/UPDATE public.github_events SET student_id/.test(text)) return [];
    if (/UPDATE github_events\s+SET status = 'processed'/.test(text) || /SET status = 'processed'/.test(text)) {
      const row = events.get(values[0]);
      if (!row) return [];
      row.status = "processed";
      row.processed_at = new Date().toISOString();
      row.claimed_at = null;
      row.next_attempt = null;
      return [];
    }
    if (/last_error = \?/.test(text)) {
      const row = events.get(values[3]);
      if (!row) return [];
      row.status = values[0];
      row.last_error = values[1];
      row.next_attempt = values[2];
      row.claimed_at = null;
      return [];
    }
    if (/INSERT INTO audit_logs/.test(text)) return [];
    if (/FROM projects p/.test(text)) return [];
    if (/UPDATE projects/.test(text)) return [];
    if (/FROM open_source_projects/.test(text)) return [];
    if (/FROM profiles p/.test(text)) return [];
    return [];
  };

  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    try {
      return Promise.resolve(handle(text, values));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  sql.json = (value) => value;
  sql.begin = async (fn) => {
    // Snapshot the mutable state so a thrown statement rolls the transaction
    // back, exactly like the real worker relies on.
    const snapshot = {
      events: new Map([...events].map(([k, v]) => [k, { ...v }])),
      activity: { ...activity }
    };
    try {
      return await fn(sql);
    } catch (error) {
      events.clear();
      for (const [k, v] of snapshot.events) events.set(k, v);
      Object.assign(activity, snapshot.activity);
      throw error;
    }
  };
  sql.events = events;
  sql.activity = activity;
  sql.failActivityOnce = () => { failActivityOnce = true; };
  return sql;
}

async function loadRoute(sql) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ getSql: () => sql }));
  vi.doMock("@/lib/env", () => ({
    env: { GITHUB_WEBHOOK_SECRET: SECRET },
    assertProductionSecrets: () => {}
  }));
  vi.doMock("@/lib/tenant", () => ({ getTenantFromRequest: async () => ({ id: TENANT }) }));
  vi.doMock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }) }));
  vi.doMock("@/lib/oss", () => ({ awardOssBadges: async () => [] }));
  vi.doMock("@/lib/ranking", () => ({
    recordEvidence: async () => {},
    recomputeScore: async () => {}
  }));
  vi.doMock("@/lib/github-issues", () => ({ applyIssueEvent: async () => null }));
  return import("@/app/api/github/webhook/route");
}

function pushRequest(deliveryId, commits = 2) {
  const body = JSON.stringify({
    ref: "refs/heads/main",
    commits: Array.from({ length: commits }, (_, i) => ({ id: `c${i}` })),
    repository: { full_name: "asha/project" },
    sender: { login: "asha" }
  });
  const signature = `sha256=${crypto.createHmac("sha256", SECRET).update(body).digest("hex")}`;
  return new Request("http://localhost/api/github/webhook", {
    method: "POST",
    headers: {
      "x-hub-signature-256": signature,
      "x-github-event": "push",
      "x-github-delivery": deliveryId,
      "content-type": "application/json"
    },
    body
  });
}

afterEach(() => {
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/env");
  vi.doUnmock("@/lib/tenant");
  vi.doUnmock("@/lib/rate-limit");
  vi.doUnmock("@/lib/oss");
  vi.doUnmock("@/lib/ranking");
  vi.doUnmock("@/lib/github-issues");
});

describe("POST /api/github/webhook processed state", () => {
  beforeEach(() => vi.resetModules());

  it("claims, aggregates once, and marks the delivery processed", async () => {
    const sql = makeGitHubDb();
    const { POST } = await loadRoute(sql);

    const first = await POST(pushRequest("delivery-1", 2));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.data.activity).toMatchObject({ applied: true, commits: 2 });
    expect(sql.activity.commits).toBe(2);
    expect(sql.events.get("delivery-1-push").status).toBe("processed");

    const second = await POST(pushRequest("delivery-1", 2));
    expect(second.status).toBe(200);
    const duplicate = await second.json();
    expect(duplicate.data.duplicate).toBe(true);
    expect(duplicate.data.processing).toBe("processed");
    // The redelivery must not add the same commits again.
    expect(sql.activity.commits).toBe(2);
  });

  it("marks a failed fan-out retryable and resumes it on redelivery", async () => {
    const sql = makeGitHubDb();
    sql.failActivityOnce();
    const { POST } = await loadRoute(sql);

    const failed = await POST(pushRequest("delivery-2", 3));
    expect(failed.status).toBe(503);
    const failedRow = sql.events.get("delivery-2-push");
    expect(failedRow.status).toBe("failed");
    expect(failedRow.attempts).toBe(1);
    expect(failedRow.next_attempt).toBeTruthy();
    expect(sql.activity.commits).toBe(0);

    // Before the backoff elapses, the delivery is acknowledged but not claimed.
    const tooSoon = await POST(pushRequest("delivery-2", 3));
    const tooSoonBody = await tooSoon.json();
    expect(tooSoonBody.data.processing).toBe("retry_later");
    expect(sql.activity.commits).toBe(0);

    // Pretend the backoff elapsed: GitHub redelivers after the timeout.
    sql.events.get("delivery-2-push").next_attempt = new Date(Date.now() - 1000).toISOString();

    const resumed = await POST(pushRequest("delivery-2", 3));
    expect(resumed.status).toBe(200);
    const resumedBody = await resumed.json();
    expect(resumedBody.data.activity).toMatchObject({ applied: true, commits: 3 });
    expect(sql.activity.commits).toBe(3);
    expect(sql.events.get("delivery-2-push").status).toBe("processed");
  });

  it("marks the delivery dead once attempts are exhausted", async () => {
    const sql = makeGitHubDb();
    const row = {
      idempotency_key: "delivery-dead-push",
      status: "processing",
      // Expired lease, one attempt short of the ceiling: the claim is allowed,
      // then the failure exhausts the budget and must not schedule another try.
      attempts: GITHUB_EVENT_MAX_ATTEMPTS - 1,
      claimed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      next_attempt: null,
      activity_applied_at: null,
      last_error: null
    };
    sql.events.set("delivery-dead-push", row);
    sql.failActivityOnce();
    const { POST } = await loadRoute(sql);

    const response = await POST(pushRequest("delivery-dead", 1));
    expect(response.status).toBe(503);
    const dead = sql.events.get("delivery-dead-push");
    expect(dead.status).toBe("dead");
    expect(dead.attempts).toBe(GITHUB_EVENT_MAX_ATTEMPTS);
    expect(dead.next_attempt).toBeNull();
    expect(sql.activity.commits).toBe(0);
  });
});
