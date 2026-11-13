import { describe, expect, it } from "vitest";
import { syncConnection, syncDueConnections } from "@/lib/practice-sync";

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

describe("practice sync cooldown", () => {
  it("does not let a manual refresh bypass the stored backoff", async () => {
    const { sql, calls } = sqlClient(async (text) => {
      if (text.includes("INSERT INTO practice_sync_runs")) return [{ id: "run-1" }];
      return [];
    });

    const result = await syncConnection(sql, {
      tenantId: "11111111-1111-4111-8111-111111111111",
      userId: "student-1",
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
        return [{ tenant_id: "11111111-1111-4111-8111-111111111111" }];
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
