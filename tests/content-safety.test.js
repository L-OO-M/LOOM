import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  findUnsafeText, isHttpUrl, isLinkedInUrl, isSafeText, normalizeForScreening,
  screenProfileCard, validGithubHandle
} from "@/lib/content-safety";

describe("normalizeForScreening", () => {
  it("folds case, leet and accents", () => {
    expect(normalizeForScreening("FÜCK")).toBe("fuck");
    expect(normalizeForScreening("F@ck$")).toBe("facks");
    expect(normalizeForScreening("h3llo")).toBe("hello");
  });

  it("collapses repeated letters and separators", () => {
    expect(normalizeForScreening("fuuuuck???")).toBe("fuck");
    expect(normalizeForScreening("a---b")).toBe("a b");
  });
});

describe("profanity screening", () => {
  it("catches plain and leet-obfuscated profanity", () => {
    expect(findUnsafeText("you are a bitch")).toBe("bitch");
    expect(findUnsafeText("sh1t")).toBe("shit");
  });

  it("catches letter-spaced evasion", () => {
    expect(findUnsafeText("f u c k")).toBe("fuck");
  });

  it("does not trip the Scunthorpe problem", () => {
    expect(isSafeText("I study classic literature in Scunthorpe")).toBe(true);
    expect(isSafeText("assassin's creed and glass assessments")).toBe(true);
    expect(isSafeText("pass the class, assessment done")).toBe(true);
  });

  it("allows honest, non-abusive text", () => {
    expect(isSafeText("DSA, React and a little Rust. Building in public.")).toBe(true);
    expect(isSafeText("")).toBe(true);
    expect(isSafeText(undefined)).toBe(true);
  });
});

describe("validGithubHandle", () => {
  it("accepts real handles", () => {
    expect(validGithubHandle("octocat")).toBe(true);
    expect(validGithubHandle("@octocat")).toBe(true);
    expect(validGithubHandle("my-name-2")).toBe(true);
    expect(validGithubHandle("a")).toBe(true);
  });

  it("rejects random characters and malformed handles", () => {
    expect(validGithubHandle("asdkj!@#")).toBe(false);
    expect(validGithubHandle("-leading")).toBe(false);
    expect(validGithubHandle("trailing-")).toBe(false);
    expect(validGithubHandle("double--hyphen")).toBe(false);
    expect(validGithubHandle("has space")).toBe(false);
    expect(validGithubHandle("a".repeat(40))).toBe(false);
    expect(validGithubHandle("")).toBe(false);
  });
});

describe("isHttpUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(isHttpUrl("https://example.com/photo.png")).toBe(true);
    expect(isHttpUrl("http://example.com/photo.png")).toBe(true);
  });

  it("rejects scripts, data URLs and relative paths", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(isHttpUrl("/photo.png")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("isLinkedInUrl", () => {
  it("accepts linkedin.com links", () => {
    expect(isLinkedInUrl("https://www.linkedin.com/in/ada")).toBe(true);
    expect(isLinkedInUrl("https://linkedin.com/in/ada")).toBe(true);
    expect(isLinkedInUrl("http://uk.linkedin.com/in/ada")).toBe(true);
  });

  it("rejects anything that is not linkedin.com", () => {
    expect(isLinkedInUrl("https://evil.com/in/ada")).toBe(false);
    expect(isLinkedInUrl("https://linkedin.com.evil.com/in/ada")).toBe(false);
    expect(isLinkedInUrl("https://notlinkedin.com")).toBe(false);
    expect(isLinkedInUrl("random url junk")).toBe(false);
    expect(isLinkedInUrl("javascript:alert(1)")).toBe(false);
    expect(isLinkedInUrl("")).toBe(false);
  });
});

describe("screenProfileCard", () => {
  it("passes a clean card", () => {
    expect(screenProfileCard({
      bio: "Building in public", location: "Bengaluru",
      github: "octocat", linkedin: "https://linkedin.com/in/ada"
    })).toEqual({ ok: true });
  });

  it("reports the first offending field with an envelope code", () => {
    expect(screenProfileCard({ github: "bad handle" }).code).toBe("INVALID_GITHUB");
    expect(screenProfileCard({ linkedin: "https://evil.com" }).code).toBe("INVALID_LINKEDIN");
    expect(screenProfileCard({ bio: "what the fuck" }).code).toBe("UNSAFE_CONTENT");
    expect(screenProfileCard({ location: "bitch town" }).code).toBe("UNSAFE_CONTENT");
  });
});

describe("the public card route actually screens input", () => {
  it("wires screenProfileCard into PUT /api/social/profile", () => {
    const route = readFileSync("app/api/social/profile/route.js", "utf8");
    expect(route).toContain("screenProfileCard");
    expect(route).toMatch(/if \(!screened\.ok\) return fail\(screened\.code/);
    expect(route).toContain("isHttpUrl(body.avatarUrl)");
  });
});
