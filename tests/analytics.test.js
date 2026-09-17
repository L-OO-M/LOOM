import { describe, it, expect } from "vitest";
import {
  normalizePeriod, compact, changePct, bucketsFor, bucketKeyFor,
  foldIntoBuckets, distinctPerBucket, weekdayDistribution,
  hostOf, sourceFor, topReferrers, topPages, topSources,
} from "@/lib/analytics";

describe("analytics helpers", () => {
  it("normalizePeriod falls back to monthly", () => {
    expect(normalizePeriod("daily")).toBe("daily");
    expect(normalizePeriod("yearly")).toBe("yearly");
    expect(normalizePeriod("bogus")).toBe("monthly");
    expect(normalizePeriod(undefined)).toBe("monthly");
  });

  it("compact groups thousands", () => {
    expect(compact(23876)).toBe("23,876");
    expect(compact(0)).toBe("0");
    expect(compact(null)).toBe("0");
  });

  it("changePct handles up/down/flat/zero-prev", () => {
    expect(changePct(125, 100)).toEqual({ pct: 25, trend: "up" });
    expect(changePct(80, 100)).toEqual({ pct: 20, trend: "down" });
    expect(changePct(100, 100).trend).toBe("flat");
    expect(changePct(5, 0).trend).toBe("up");
    expect(changePct(0, 0).trend).toBe("flat");
  });

  it("bucketsFor returns the right counts", () => {
    expect(bucketsFor("daily")).toHaveLength(14);
    expect(bucketsFor("monthly")).toHaveLength(12);
    expect(bucketsFor("yearly")).toHaveLength(4);
  });

  it("bucketKeyFor keys dates per period", () => {
    expect(bucketKeyFor("2026-09-05T10:00:00Z", "daily")).toBe("2026-09-05");
    expect(bucketKeyFor("2026-09-05T10:00:00Z", "monthly")).toBe("2026-09");
    expect(bucketKeyFor("2026-09-05T10:00:00Z", "yearly")).toBe("2026");
    expect(bucketKeyFor("not-a-date", "daily")).toBeNull();
  });

  it("foldIntoBuckets counts rows per bucket", () => {
    const buckets = bucketsFor("yearly");
    const rows = [{ at: "2026-03-01T00:00:00Z" }, { at: "2026-05-01T00:00:00Z" }];
    const folded = foldIntoBuckets(buckets, rows, (r) => r.at, () => 1, "yearly");
    const y2026 = folded.find((b) => b.key === "2026");
    expect(y2026.value).toBe(2);
  });

  it("distinctPerBucket dedupes students", () => {
    const buckets = bucketsFor("daily");
    const today = buckets[buckets.length - 1].key;
    const rows = [
      { student_id: "a", day: `${today}T01:00:00Z` },
      { student_id: "a", day: `${today}T02:00:00Z` },
      { student_id: "b", day: `${today}T03:00:00Z` },
    ];
    const out = distinctPerBucket(buckets, rows, (r) => r.day, (r) => r.student_id, "daily");
    expect(out[out.length - 1].value).toBe(2);
  });

  it("weekdayDistribution maps Mon..Sun with ratios", () => {
    // 2026-09-07 is a Monday.
    const rows = [{ day: "2026-09-07", commits: 2, pull_requests: 0, reviews: 0 }];
    const dist = weekdayDistribution(rows);
    expect(dist).toHaveLength(7);
    expect(dist[0].label).toBe("Mon");
    expect(dist[0].value).toBe(2);
    expect(dist[0].ratio).toBe(1);
    expect(dist[6].value).toBe(0);
  });

  it("hostOf extracts clean hostnames", () => {
    expect(hostOf("https://www.google.com/search?q=x")).toBe("google.com");
    expect(hostOf(null)).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });

  it("sourceFor classifies channels", () => {
    expect(sourceFor(null)).toBe("Direct");
    expect(sourceFor("google.com")).toBe("Organic Search");
    expect(sourceFor("linkedin.com")).toBe("Social");
    expect(sourceFor("example.com")).toBe("Referral");
    expect(sourceFor("mail.example.com")).toBe("Email");
  });

  it("traffic tops count referrers, pages, sources", () => {
    const views = [
      { path: "/admin", referrer: "https://google.com/", visitor_key: "a" },
      { path: "/admin", referrer: "https://google.com/", visitor_key: "b" },
      { path: "/login", referrer: null, visitor_key: "a" },
    ];
    expect(topReferrers(views)).toEqual([
      { id: "google.com", label: "google.com", count: 2 },
      { id: "Direct", label: "Direct", count: 1 },
    ]);
    expect(topPages(views)[0]).toEqual({ id: "/admin", label: "/admin", count: 2 });
    const sources = topSources(views);
    expect(sources.find((s) => s.label === "Organic Search").count).toBe(2);
    expect(sources.find((s) => s.label === "Direct").pct).toBeCloseTo(33.3, 1);
  });
});
