import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

// next.config.mjs owns the static security headers for every response.
// These assertions guard the CSP directives that the Zen Mode YouTube
// embeds depend on, plus the hardening directives from docs/25 §3.5.
async function cspDirectives() {
  const rules = await nextConfig.headers();
  const rule = rules.find((entry) => entry.source === "/(.*)");
  expect(rule, "a catch-all header rule must exist").toBeTruthy();

  const header = rule.headers.find(
    (entry) => entry.key.toLowerCase() === "content-security-policy"
  );
  expect(header, "Content-Security-Policy must be set").toBeTruthy();

  return new Map(
    header.value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name.toLowerCase(), sources.join(" ")];
      })
  );
}

describe("CSP", () => {
  it("frames self and the YouTube hosts used by lib/zen-embed.js", async () => {
    const directives = await cspDirectives();
    const frameSrc = directives.get("frame-src");
    expect(frameSrc, "frame-src must be explicit").toBeTruthy();

    const sources = frameSrc.split(/\s+/);
    expect(sources).toContain("'self'");
    expect(sources).toContain("https://www.youtube-nocookie.com");
    expect(sources).toContain("https://youtube-nocookie.com");
    expect(sources).toContain("https://www.youtube.com");
    expect(sources).toContain("https://youtube.com");
  });

  it("disables plugins and pins the document base URI", async () => {
    const directives = await cspDirectives();
    expect(directives.get("object-src")).toBe("'none'");
    expect(directives.get("base-uri")).toBe("'self'");
  });

  it("keeps production free of unsafe-eval and pins the remaining sources", async () => {
    const directives = await cspDirectives();

    expect(directives.get("default-src")).toBe("'self'");
    expect(directives.get("script-src")).toBe(
      "'self' 'unsafe-inline' https://*.supabase.co"
    );
    expect(directives.get("style-src")).toBe("'self' 'unsafe-inline'");
    expect(directives.get("img-src")).toBe("'self' data: https: blob:");
    expect(directives.get("font-src")).toBe("'self' data:");
    expect(directives.get("connect-src")).toBe(
      "'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co"
    );
    expect(directives.get("frame-ancestors")).toBe("'none'");
  });

  it("keeps fonts self-hosted rather than allowing Google Fonts", async () => {
    const directives = await cspDirectives();
    const fontSurface = `${directives.get("font-src")} ${directives.get("style-src")}`;

    expect(fontSurface).not.toContain("fonts.googleapis.com");
    expect(fontSurface).not.toContain("fonts.gstatic.com");
  });
});
