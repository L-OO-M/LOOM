import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HTTP_URL_MESSAGE, isOptionalHttpUrl } from "@/lib/content-safety";

describe("isOptionalHttpUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(isOptionalHttpUrl("https://example.com/a")).toBe(true);
    expect(isOptionalHttpUrl("http://example.com/a")).toBe(true);
  });

  it("keeps optional and nullable semantics", () => {
    expect(isOptionalHttpUrl(undefined)).toBe(true);
    expect(isOptionalHttpUrl(null)).toBe(true);
  });

  it("rejects non-http(s) schemes and empty values", () => {
    expect(isOptionalHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isOptionalHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isOptionalHttpUrl("ftp://example.com/file")).toBe(false);
    expect(isOptionalHttpUrl("/relative")).toBe(false);
    expect(isOptionalHttpUrl("")).toBe(false);
  });

  it("exposes a shared message", () => {
    expect(HTTP_URL_MESSAGE).toMatch(/http\(s\)/);
  });
});

const URL_FIELD_ROUTES = [
  "app/api/roadmap/progress/route.js",
  "app/api/contributions/route.js",
  "app/api/contests/route.js",
  "app/api/projects/route.js",
  "app/api/projects/[id]/route.js",
  "app/api/opensource/contributions/route.js",
  "app/api/lead/directory/route.js",
  "app/api/lead/directory/[id]/route.js",
  "app/api/lead/assets/route.js",
  "app/api/lead/assets/[id]/route.js",
  "app/api/admin/resources/route.js",
  "app/api/admin/achievements/route.js",
  "app/api/events/[id]/materials/route.js",
  "app/api/social/profile/route.js"
];

describe("user-supplied URL fields reject non-http(s) values", () => {
  for (const file of URL_FIELD_ROUTES) {
    it(`${file} uses the shared http(s) refinement`, () => {
      const route = readFileSync(file, "utf8");
      expect(route).not.toMatch(/z\.string\(\)\.url\(/);
      expect(route).toContain("isOptionalHttpUrl");
    });
  }

  it("the asset download route rejects a non-http(s) external_url", () => {
    const route = readFileSync("app/api/lead/assets/[id]/download/route.js", "utf8");
    expect(route).toContain("isHttpUrl(asset.external_url)");
    expect(route).toContain("INVALID_URL");
  });
});
