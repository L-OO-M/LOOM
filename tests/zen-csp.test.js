import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config.mjs";
import { ZEN_SITE_ALLOWLIST } from "@/lib/zen-embed";

// The CSP is the browser-side gate on what Zen Mode may frame. A missing
// frame-src silently falls back to default-src 'self' and blocks every
// external iframe — the defect this test exists to prevent from returning.
// The sources must stay derived from ZEN_SITE_ALLOWLIST (single source of
// truth) or an embeddable host added there would still be refused here.

async function cspValue() {
  const rules = await nextConfig.headers();
  const rule = rules.find((r) => r.source === "/(.*)");
  const header = rule.headers.find((h) => h.key === "Content-Security-Policy");
  return header.value;
}

function directives(csp) {
  const out = new Map();
  for (const part of csp.split(";")) {
    const [name, ...rest] = part.trim().split(/\s+/);
    if (name) out.set(name, rest);
  }
  return out;
}

describe("Content-Security-Policy frame-src", () => {
  it("keeps the strict baseline (default-src self, frame-ancestors none)", async () => {
    const map = directives(await cspValue());
    expect(map.get("default-src")).toEqual(["'self'"]);
    expect(map.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("declares a frame-src that allows Zen's own origin and YouTube", async () => {
    const map = directives(await cspValue());
    const frameSrc = map.get("frame-src");
    expect(frameSrc, "frame-src must be present or every embed is refused").toBeTruthy();
    expect(frameSrc).toContain("'self'");
    expect(frameSrc).toContain("https://www.youtube-nocookie.com");
  });

  it("allows every allowlisted Zen site origin (cannot drift)", async () => {
    const map = directives(await cspValue());
    const frameSrc = map.get("frame-src") || [];
    for (const host of ZEN_SITE_ALLOWLIST) {
      expect(frameSrc, `frame-src is missing ${host}`).toContain(`https://${host}`);
    }
  });

  it("does not open frame-src to the whole web", async () => {
    const map = directives(await cspValue());
    expect(map.get("frame-src")).not.toContain("https:");
  });
});
