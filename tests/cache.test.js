import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, getCached, invalidate, setCached } from "@/lib/cache";

// The cache sits in front of pooler-backed reads. Its contract is deliberately
// small: TTL expiry, a prefix-scoped invalidate, and no accidental caching of a
// null result (which would turn "no rows yet" into a permanent empty page).

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
  invalidate("");
});

afterEach(() => {
  invalidate("");
  vi.useRealTimers();
});

describe("getCached / setCached", () => {
  it("returns null for a key that was never written", () => {
    expect(getCached("missing")).toBe(null);
  });

  it("returns the stored value before the TTL expires", () => {
    setCached("k", { rows: 2 }, 1000);
    vi.advanceTimersByTime(999);
    expect(getCached("k")).toEqual({ rows: 2 });
  });

  it("drops the value once the TTL has passed", () => {
    setCached("k", "value", 1000);
    vi.advanceTimersByTime(1001);
    expect(getCached("k")).toBe(null);
  });

  it("keeps the value at the exact expiry instant (strict comparison)", () => {
    setCached("k", "value", 1000);
    vi.advanceTimersByTime(1000);
    expect(getCached("k")).toBe("value");
  });

  it("uses a 30s default TTL", () => {
    setCached("k", "value");
    vi.advanceTimersByTime(30_000);
    expect(getCached("k")).toBe("value");
    vi.advanceTimersByTime(1);
    expect(getCached("k")).toBe(null);
  });

  it("stores falsy values other than null", () => {
    setCached("zero", 0);
    setCached("false", false);
    setCached("empty", "");
    expect(getCached("zero")).toBe(0);
    expect(getCached("false")).toBe(false);
    expect(getCached("empty")).toBe("");
  });
});

describe("cached", () => {
  it("loads once and serves the cached value afterwards", async () => {
    const loader = vi.fn(async () => ({ total: 3 }));
    await expect(cached("r", 1000, loader)).resolves.toEqual({ total: 3 });
    await expect(cached("r", 1000, loader)).resolves.toEqual({ total: 3 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads after expiry", async () => {
    const loader = vi.fn(async () => "v");
    await cached("r", 1000, loader);
    vi.advanceTimersByTime(1001);
    await cached("r", 1000, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache a null result", async () => {
    const loader = vi.fn(async () => null);
    await cached("n", 1000, loader);
    await cached("n", 1000, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejection", async () => {
    const loader = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(cached("e", 1000, loader)).rejects.toThrow("db down");
    await expect(cached("e", 1000, loader)).rejects.toThrow("db down");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("invalidate", () => {
  it("removes every key with the prefix and leaves the rest", () => {
    setCached("resources:counts", 1);
    setCached("resources:levels", 2);
    setCached("progress:nodes", 3);

    invalidate("resources:");

    expect(getCached("resources:counts")).toBe(null);
    expect(getCached("resources:levels")).toBe(null);
    expect(getCached("progress:nodes")).toBe(3);
  });

  it("with an empty prefix clears everything", () => {
    setCached("a", 1);
    setCached("b", 2);
    invalidate("");
    expect(getCached("a")).toBe(null);
    expect(getCached("b")).toBe(null);
  });
});
