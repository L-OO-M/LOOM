import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/server-cache.js calls unstable_cache() at module load, so the cache
// wrapper has to be in place before the module is imported. The fake records
// every registration and forwards the call, which lets the test assert the
// caching contract (key parts, TTL, tag) instead of the cache implementation.
const cache = vi.hoisted(() => ({ entries: [] }));
const sqlState = vi.hoisted(() => ({ calls: [], rows: [] }));

vi.mock("next/cache", () => ({
  unstable_cache: (fn, keyParts, options) => {
    cache.entries.push({ fn, keyParts, options });
    return (...args) => fn(...args);
  }
}));

vi.mock("@/lib/db", () => ({
  // Tagged-template recorder: the SQL text keeps a ? per interpolated value so
  // assertions can prove both the statement shape and the bound parameter.
  getSql: () => (strings, ...values) => {
    sqlState.calls.push({
      sql: strings.reduce(
        (acc, part, i) => acc + part + (i < values.length ? `?${i + 1}` : ""),
        ""
      ),
      values
    });
    if (sqlState.reject) return Promise.reject(sqlState.reject);
    return Promise.resolve(sqlState.rows);
  }
}));

const serverCache = await import("@/lib/server-cache");

const byKey = (key) => cache.entries.find((entry) => entry.keyParts[0] === key);

beforeEach(() => {
  sqlState.calls.length = 0;
  sqlState.rows = [];
  sqlState.reject = null;
});

describe("server-cache registration contract", () => {
  it("registers exactly the four known cache entries", () => {
    expect(cache.entries.map((entry) => entry.keyParts[0]).sort()).toEqual([
      "progress:nodes",
      "resources:counts",
      "resources:levels",
      "resources:total"
    ]);
  });

  it("exports every registered entry as a callable", () => {
    const exports = [
      serverCache.getCachedResourceCounts,
      serverCache.getCachedResourceLevels,
      serverCache.getCachedResourceTotal,
      serverCache.getCachedNodeProgress
    ];
    for (const fn of exports) expect(typeof fn).toBe("function");
  });

  it("tags each entry with its own key so mutations cannot cross-invalidate", () => {
    for (const entry of cache.entries) {
      expect(entry.options.tags).toEqual([entry.keyParts[0]]);
    }
  });

  it("holds catalog caches for 30s and user progress for 10s", () => {
    expect(byKey("resources:counts").options.revalidate).toBe(30);
    expect(byKey("resources:levels").options.revalidate).toBe(30);
    expect(byKey("resources:total").options.revalidate).toBe(30);
    expect(byKey("progress:nodes").options.revalidate).toBe(10);
  });

  it("does not touch the database at import time", () => {
    expect(sqlState.calls).toHaveLength(0);
  });
});

describe("cached catalog queries", () => {
  it("counts resources grouped by domain and passes the rows through", async () => {
    const rows = [{ domain: "web", n: 12 }];
    sqlState.rows = rows;

    await expect(serverCache.getCachedResourceCounts()).resolves.toBe(rows);
    expect(sqlState.calls).toHaveLength(1);
    expect(sqlState.calls[0].sql).toContain("COUNT(*)::int AS n");
    expect(sqlState.calls[0].sql).toContain("FROM resources GROUP BY domain");
    expect(sqlState.calls[0].values).toEqual([]);
  });

  it("lists distinct resource levels in ascending order", async () => {
    sqlState.rows = [{ level: "beginner" }];
    await serverCache.getCachedResourceLevels();
    expect(sqlState.calls[0].sql).toContain("SELECT DISTINCT level FROM resources");
    expect(sqlState.calls[0].sql).toContain("ORDER BY level ASC");
  });

  it("returns the total row set unchanged", async () => {
    const rows = [{ n: 264 }];
    sqlState.rows = rows;
    await expect(serverCache.getCachedResourceTotal()).resolves.toBe(rows);
    expect(sqlState.calls[0].sql).toContain("COUNT(*)::int AS n FROM resources");
  });

  it("propagates a database failure instead of caching an empty result", async () => {
    sqlState.reject = new Error("pooler unavailable");
    await expect(serverCache.getCachedResourceTotal()).rejects.toThrow("pooler unavailable");
    sqlState.reject = null;
  });
});

describe("cached per-student progress", () => {
  it("binds the student id as a parameter, never as interpolated text", async () => {
    const studentId = "8d1b8f8e-0f6f-4f4f-9a3a-1f0d9c6f2a11";
    sqlState.rows = [{ node_id: "node-1" }];

    await expect(serverCache.getCachedNodeProgress(studentId)).resolves.toEqual([
      { node_id: "node-1" }
    ]);

    const call = sqlState.calls[0];
    expect(call.sql).toContain("student_id = ?1");
    expect(call.sql).not.toContain(studentId);
    expect(call.values).toEqual([studentId]);
  });

  it("filters to completed nodes only", async () => {
    await serverCache.getCachedNodeProgress("any-id");
    expect(sqlState.calls[0].sql).toContain("status = 'completed'");
  });

  it("scopes the query to student_roadmap_progress", async () => {
    await serverCache.getCachedNodeProgress("any-id");
    expect(sqlState.calls[0].sql).toContain("FROM student_roadmap_progress");
  });

  it("accepts an empty result without inventing rows", async () => {
    sqlState.rows = [];
    await expect(serverCache.getCachedNodeProgress("no-progress")).resolves.toEqual([]);
  });

  it("keeps concurrent lookups for different students independent", async () => {
    sqlState.rows = [{ node_id: "a" }];
    await serverCache.getCachedNodeProgress("student-a");
    sqlState.rows = [{ node_id: "b" }];
    await serverCache.getCachedNodeProgress("student-b");

    expect(sqlState.calls.map((call) => call.values[0])).toEqual(["student-a", "student-b"]);
  });
});
