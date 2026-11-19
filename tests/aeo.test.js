import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  PUBLIC_PATHS,
  PRIVATE_PATHS,
  MACHINE_ENDPOINTS,
  CANONICAL_ANSWERS,
  aeoSummary,
  buildLlmsTxt,
  buildLlmsFullTxt
} from "@/lib/aeo";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

// AEO copy is read by answer engines, not by a human who can notice a stale
// claim. These tests pin the properties that make it safe to publish: only
// public paths, absolute canonical URLs, one answer per question, and no
// private area leaking into a machine-readable document.

const saved = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  APP_BASE_URL: process.env.APP_BASE_URL
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz";
  delete process.env.APP_BASE_URL;
});

afterEach(() => {
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("public path inventory", () => {
  it("lists only rooted, unique paths", () => {
    const paths = PUBLIC_PATHS.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith("/")).toBe(true);
  });

  it("gives every public path a label and a description", () => {
    for (const entry of PUBLIC_PATHS) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("never lists a private area as public", () => {
    const paths = PUBLIC_PATHS.map((p) => p.path);
    for (const path of paths) {
      for (const privatePath of ["/student", "/lead", "/admin", "/setup", "/login", "/register"]) {
        expect(path === privatePath || path.startsWith(`${privatePath}/`)).toBe(false);
      }
    }
  });

  it("keeps the private path list complete", () => {
    expect(PRIVATE_PATHS).toEqual(
      expect.arrayContaining(["/student", "/lead", "/admin", "/setup", "/login", "/register", "/auth", "/api"])
    );
  });

  it("names the machine endpoints the public document promises", () => {
    const paths = MACHINE_ENDPOINTS.map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/public/summary",
        "/api/public/events",
        "/api/public/projects",
        "/api/public/departments",
        "/api/chapters",
        "/sitemap.xml",
        "/llms.txt",
        "/llms-full.txt"
      ])
    );
  });
});

describe("canonical answers", () => {
  it("asks each question once", () => {
    const questions = CANONICAL_ANSWERS.map((q) => q.question);
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("answers every question with a factual sentence, not a stub", () => {
    for (const entry of CANONICAL_ANSWERS) {
      expect(entry.answer.length).toBeGreaterThan(40);
      expect(entry.answer.trim().endsWith(".")).toBe(true);
    }
  });

  it("describes the leaderboard in terms of verified evidence", () => {
    const leaderboard = CANONICAL_ANSWERS.find((q) => /leaderboard/i.test(q.question));
    expect(leaderboard).toBeTruthy();
    expect(leaderboard.answer).toMatch(/verified|confirm/i);
    expect(leaderboard.answer).not.toMatch(/every commit (earns|adds)/i);
  });
});

describe("aeoSummary", () => {
  it("uses the canonical site identity and origin", () => {
    const summary = aeoSummary();
    expect(summary.name).toBe(SITE_NAME);
    expect(summary.tagline).toBe(SITE_TAGLINE);
    expect(summary.description).toBe(SITE_DESCRIPTION);
    expect(summary.url).toBe("https://lets-loom.xyz/");
  });

  it("expands every public path and machine endpoint to an absolute URL", () => {
    const summary = aeoSummary();
    for (const page of summary.publicPages) {
      expect(page.url.startsWith("https://lets-loom.xyz/")).toBe(true);
    }
    for (const endpoint of summary.machineEndpoints) {
      expect(endpoint.url.startsWith("https://lets-loom.xyz/")).toBe(true);
    }
    expect(summary.publicPages).toHaveLength(PUBLIC_PATHS.length);
  });

  it("is deterministic for the same origin", () => {
    expect(aeoSummary()).toEqual(aeoSummary());
  });
});

describe("llms documents", () => {
  it("includes every canonical question and answer", () => {
    const text = buildLlmsTxt();
    for (const entry of CANONICAL_ANSWERS) {
      expect(text).toContain(`Q: ${entry.question}`);
      expect(text).toContain(`A: ${entry.answer}`);
    }
  });

  it("includes every public page and machine endpoint as an absolute URL", () => {
    const text = buildLlmsTxt();
    for (const page of PUBLIC_PATHS) {
      expect(text).toContain(`https://lets-loom.xyz${page.path}`);
    }
    for (const endpoint of MACHINE_ENDPOINTS) {
      expect(text).toContain(`https://lets-loom.xyz${endpoint.path}`);
    }
  });

  it("never publishes a private area path", () => {
    for (const text of [buildLlmsTxt(), buildLlmsFullTxt()]) {
      for (const privatePath of ["/student", "/lead", "/admin", "/setup", "/login", "/register", "/auth"]) {
        expect(text).not.toContain(`${privatePath}/`);
        expect(text).not.toContain(`${privatePath} `);
      }
    }
  });

  it("ends with exactly one trailing newline", () => {
    expect(buildLlmsTxt().endsWith("\n")).toBe(true);
    expect(buildLlmsTxt().endsWith("\n\n")).toBe(false);
    expect(buildLlmsFullTxt().endsWith("\n")).toBe(true);
  });

  it("tells a model not to invent counts", () => {
    expect(buildLlmsTxt()).toMatch(/Do not state member counts/i);
    expect(buildLlmsFullTxt()).toMatch(/Do not infer\s+chapter size/i);
  });

  it("renders the full reference with one heading per canonical answer", () => {
    const text = buildLlmsFullTxt();
    for (const entry of CANONICAL_ANSWERS) {
      expect(text).toContain(`### ${entry.question}`);
    }
  });
});
