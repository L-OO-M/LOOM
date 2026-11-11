import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// #44: a resource with no URL is a dead end in a page that promises a path.
// Keep the shipped catalogue honest rather than discovering a blank link at
// runtime.

const ROOT = join(process.cwd(), "load", "roadmap-data");

function resourcesOf(file) {
  const data = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
  if (Array.isArray(data.tracks)) return data.tracks.flatMap((t) => t.resources || []);
  return data.resources || [];
}

describe("roadmap resource catalogue", () => {
  it("ships no null URLs in any domain file", () => {
    for (const file of readdirSync(ROOT).filter((f) => f.endsWith(".json"))) {
      const missing = resourcesOf(file).filter((r) => !r.url);
      expect(missing.map((r) => r.id), `${file} has resources without a URL`).toEqual([]);
    }
  });

  it("gives every shipped resource an https URL", () => {
    for (const file of readdirSync(ROOT).filter((f) => f.endsWith(".json"))) {
      for (const r of resourcesOf(file)) {
        expect(r.url, `${file}:${r.id}`).toMatch(/^https:\/\//);
      }
    }
  });

  it("leaves no catalogue resource without a URL in the platform seed", () => {
    const source = readFileSync(join(process.cwd(), "load", "seed-content.js"), "utf8");
    expect(source).not.toMatch(/minutes:\s*\d+\s*\}/);
  });
});
