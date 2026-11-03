import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";
import { buildCsp, createNonce, YOUTUBE_FRAME_HOSTS } from "../lib/csp";

// The policy lives in lib/csp.js and is emitted per request by middleware.js,
// because the nonce has to be fresh. Production `script-src` must NOT contain
// 'unsafe-inline': Next stamps the nonce onto its own inline scripts, which is
// the only way they are allowed to run. 'unsafe-eval' stays dev-only.
const NONCE = "dGVzdC1ub25jZS0xMjM0NTY3OA";

function directivesOf(policy) {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name.toLowerCase(), sources.join(" ")];
      })
  );
}

const production = directivesOf(buildCsp({ nonce: NONCE }));
const development = directivesOf(buildCsp({ nonce: NONCE, dev: true }));

describe("CSP", () => {
  it("allows Next's inline scripts by nonce and drops unsafe-inline in production", () => {
    const scriptSrc = production.get("script-src");
    expect(scriptSrc, "script-src must be explicit").toBeTruthy();

    const sources = scriptSrc.split(/\s+/);
    expect(sources).toContain("'self'");
    expect(sources).toContain(`'nonce-${NONCE}'`);
    expect(sources).toContain("https://*.supabase.co");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("keeps unsafe-eval for the dev server only", () => {
    expect(development.get("script-src")).toContain("'unsafe-eval'");
    expect(development.get("script-src")).toContain(`'nonce-${NONCE}'`);
    expect(development.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("frames self and the YouTube hosts used by lib/zen-embed.js", () => {
    const sources = production.get("frame-src").split(/\s+/);
    for (const host of YOUTUBE_FRAME_HOSTS) expect(sources).toContain(host);
    expect(production.get("frame-src")).toBe(YOUTUBE_FRAME_HOSTS.join(" "));
  });

  it("disables plugins and pins the document base URI", () => {
    expect(production.get("object-src")).toBe("'none'");
    expect(production.get("base-uri")).toBe("'self'");
  });

  it("keeps the remaining source directives", () => {
    expect(production.get("default-src")).toBe("'self'");
    expect(production.get("style-src")).toBe("'self' 'unsafe-inline'");
    expect(production.get("img-src")).toBe("'self' data: https: blob:");
    expect(production.get("font-src")).toBe("'self' data:");
    expect(production.get("connect-src")).toBe(
      "'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co"
    );
    expect(production.get("frame-ancestors")).toBe("'none'");
  });

  it("keeps fonts self-hosted rather than allowing Google Fonts", () => {
    const fontSurface = `${production.get("font-src")} ${production.get("style-src")}`;

    expect(fontSurface).not.toContain("fonts.googleapis.com");
    expect(fontSurface).not.toContain("fonts.gstatic.com");
  });

  it("generates a unique, CSP-safe nonce per call", () => {
    const first = createNonce();
    const second = createNonce();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(16);
    // Next parses the nonce with /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/.
    expect(first).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/);
  });

  it("refuses to build a policy without a nonce", () => {
    expect(() => buildCsp()).toThrow(/nonce/i);
  });

  it("is not also emitted as a static header by next.config.mjs", async () => {
    // One source of truth: a second CSP in headers() would either override the
    // nonced one or reintroduce 'unsafe-inline'.
    const rules = await nextConfig.headers();
    for (const rule of rules) {
      for (const header of rule.headers) {
        expect(header.key.toLowerCase()).not.toBe("content-security-policy");
      }
    }
  });
});
