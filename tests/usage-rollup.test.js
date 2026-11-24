import { describe, expect, it } from "vitest";
import { rollupUsage } from "@/lib/usage-rollup";

const TENANT = "11111111-1111-4111-8111-111111111111";

function makeSql() {
  const calls = [];
  function tag(strings, ...values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.includes("COUNT(*)::int AS n FROM page_views")) return Promise.resolve([{ n: 4 }]);
    if (text.includes("COUNT(*)::int AS n FROM ui_events")) return Promise.resolve([{ n: 2 }]);
    if (text.includes("COUNT(*) FILTER (WHERE event = 'tour_start')")) {
      return Promise.resolve([{ tenant_id: TENANT, tour: "student", version: 1, started: 5, completed: 2, skipped: 1 }]);
    }
    if (text.includes("event = 'tour_step'")) {
      return Promise.resolve([
        { tenant_id: TENANT, tour: "student", version: 1, step: 2, step_id: "learn", reached: 3 },
        { tenant_id: TENANT, tour: "student", version: 1, step: 1, step_id: "home", reached: 5 }
      ]);
    }
    if (text.includes("COUNT(*)::int AS n FROM usage_daily")) return Promise.resolve([{ n: 3 }]);
    return Promise.resolve([]);
  }
  tag.begin = async (fn) => fn(tag);
  return { sql: tag, calls };
}

const NOW = new Date("2026-11-24T10:00:00.000Z");

describe("usage rollup", () => {
  it("replaces yesterday and writes the funnel steps in order", async () => {
    const { sql, calls } = makeSql();
    const result = await rollupUsage(sql, { days: 1, now: NOW });

    expect(result).toMatchObject({ days: ["2026-11-23"], pageViews: 4, tours: 2, routes: 3, applied: true });

    const deletes = calls.filter((call) => call.text.startsWith("DELETE FROM"));
    expect(deletes.map((call) => call.text)).toEqual([
      "DELETE FROM usage_daily WHERE day = ?::date",
      "DELETE FROM tour_daily WHERE day = ?::date",
      "DELETE FROM usage_daily_totals WHERE day = ?::date"
    ]);
    expect(deletes[0].values[0]).toBe("2026-11-23");

    const usageInsert = calls.find((call) => call.text.startsWith("INSERT INTO usage_daily "));
    expect(usageInsert.text).toContain("COUNT(DISTINCT visitor_key)");
    expect(usageInsert.values[0]).toBe("2026-11-23");

    const totalsInsert = calls.find((call) => call.text.startsWith("INSERT INTO usage_daily_totals"));
    expect(totalsInsert.text).toContain("COUNT(DISTINCT session_key)");
    expect(totalsInsert.values[0]).toBe("2026-11-23");

    const tourInsert = calls.find((call) => call.text.startsWith("INSERT INTO tour_daily"));
    expect(tourInsert.values).toContain(TENANT);
    expect(tourInsert.values).toContain(5);
    expect(tourInsert.values).toContain(2);
    const steps = JSON.parse(tourInsert.values.find((value) => typeof value === "string" && value.startsWith("[")));
    expect(steps).toEqual([
      { step: 1, id: "home", reached: 5 },
      { step: 2, id: "learn", reached: 3 }
    ]);

    // Delete must precede insert inside the same transaction, or a rerun can
    // leave yesterday doubled.
    expect(calls.indexOf(usageInsert)).toBeGreaterThan(calls.indexOf(deletes[0]));
  });

  it("never writes on a dry run", async () => {
    const { sql, calls } = makeSql();
    const result = await rollupUsage(sql, { days: 2, now: NOW, apply: false });

    expect(result.applied).toBe(false);
    expect(result.days).toEqual(["2026-11-22", "2026-11-23"]);
    expect(result.routes).toBe(0);
    expect(calls.some((call) => call.text.startsWith("DELETE"))).toBe(false);
    expect(calls.some((call) => call.text.startsWith("INSERT"))).toBe(false);
  });

  it("clamps the window and refuses to roll today", async () => {
    const { sql } = makeSql();
    const result = await rollupUsage(sql, { days: 0, now: NOW });
    expect(result.days).toEqual(["2026-11-23"]);
  });
});
