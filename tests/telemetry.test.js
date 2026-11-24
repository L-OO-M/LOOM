import { describe, expect, it } from "vitest";
import {
  areaFromPath,
  isBotUserAgent,
  isTrustedRequest,
  normalizePath,
  safeSessionKey,
  sanitizeBatch,
  sanitizeEvent,
  tourStatePatch,
  visitorKeyFor
} from "@/lib/telemetry";

describe("telemetry path policy", () => {
  it("drops query strings, hashes and ids so destinations aggregate", () => {
    expect(normalizePath("/student/events/3f2504e0-4f89-41d3-9a0c-0305e82c3301?ref=email#top")).toBe(
      "/student/events/:id"
    );
    expect(normalizePath("/admin/students/42")).toBe("/admin/students/:n");
    expect(normalizePath("https://evil.test/x")).toBe("/");
    expect(normalizePath("//student//events")).toBe("/student/events");
  });

  it("maps a path to one workspace", () => {
    expect(areaFromPath("/student/roadmap")).toBe("student");
    expect(areaFromPath("/admin")).toBe("admin");
    expect(areaFromPath("/lead/roster")).toBe("lead");
    expect(areaFromPath("/events")).toBe("public");
  });
});

describe("telemetry event policy", () => {
  it("accepts an allowlisted event and normalizes it", () => {
    expect(
      sanitizeEvent(
        { event: "page_view", path: "/student/practice?tab=week", sessionKey: "abcdefgh-1234" },
        "/fallback"
      )
    ).toMatchObject({
      event: "page_view",
      path: "/student/practice",
      area: "student",
      sessionKey: "abcdefgh-1234"
    });
  });

  it("refuses unknown events, bad sessions and oversized batches", () => {
    expect(sanitizeEvent({ event: "purchase" })).toBeNull();
    expect(safeSessionKey("short")).toBeNull();
    expect(safeSessionKey("valid-session-1")).toBe("valid-session-1");
    const many = Array.from({ length: 30 }, () => ({ event: "page_view", path: "/student" }));
    expect(sanitizeBatch(many)).toHaveLength(10);
  });

  it("keeps metadata flat, short and free of contact fields", () => {
    const event = sanitizeEvent({
      event: "tour_step",
      path: "/student",
      metadata: {
        tour: "student",
        version: 1,
        step: 2,
        email: "person@example.test",
        message: "hello",
        nested: { a: 1 },
        long: "x".repeat(400)
      }
    });
    expect(event.metadata).toMatchObject({ tour: "student", version: 1, step: 2 });
    expect(event.metadata.email).toBeUndefined();
    expect(event.metadata.message).toBeUndefined();
    expect(event.metadata.nested).toBeUndefined();
    expect(event.metadata.long.length).toBe(160);
  });

  it("writes tour state only for a finished or skipped tour", () => {
    expect(tourStatePatch("tour_complete", { tour: "student", version: 2 })).toEqual({ student: 2 });
    expect(tourStatePatch("tour_skip", { tour: "student", version: 1 })).toEqual({ student: 1 });
    expect(tourStatePatch("tour_step", { tour: "student", version: 1 })).toBeNull();
    expect(tourStatePatch("tour_complete", { tour: "Student!", version: 1 })).toBeNull();
    expect(tourStatePatch("tour_complete", { tour: "student", version: 1.5 })).toBeNull();
  });
});

describe("telemetry request policy", () => {
  it("excludes bots and previews", () => {
    expect(isBotUserAgent("Mozilla/5.0 HeadlessChrome/120")).toBe(true);
    expect(isBotUserAgent("Googlebot/2.1")).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15")).toBe(false);
  });

  it("refuses a cross-site post but allows same-origin and no-site", () => {
    const request = (headers) => new Request("http://localhost/api/telemetry", { method: "POST", headers });
    expect(isTrustedRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isTrustedRequest(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isTrustedRequest(request({ "sec-fetch-site": "none" }))).toBe(true);
    expect(isTrustedRequest(request({ origin: "https://evil.test", host: "loom.test" }))).toBe(false);
    expect(isTrustedRequest(request({ origin: "https://loom.test", host: "loom.test" }))).toBe(true);
  });

  it("rotates the anonymous key daily and never stores the address", () => {
    const a = visitorKeyFor({ ip: "203.0.113.9", userAgent: "UA", day: "2026-01-01", secret: "s" });
    const b = visitorKeyFor({ ip: "203.0.113.9", userAgent: "UA", day: "2026-01-02", secret: "s" });
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("203.0.113.9");
  });
});
