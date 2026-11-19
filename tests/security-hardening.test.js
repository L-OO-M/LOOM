import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static guards for the fixes recorded in docs/30-security-audit.md. Each case
// pins a property that was actually broken once; a future edit that quietly
// restores the old shape fails here even if no runtime test covers the branch.
const read = (path) => readFileSync(path, "utf8");

describe("request body caps", () => {
  it("middleware rejects oversized bodies before a handler buffers them", () => {
    const src = read("middleware.js");
    expect(src).toContain("checkBodySize(request, pathname)");
    expect(src).toContain("PAYLOAD_TOO_LARGE");
  });

  it("has an explicit upload allowlist and a signed-webhook cap", () => {
    const limits = read("lib/request-limits.js");
    expect(limits).toContain("UPLOAD_BODY_LIMIT");
    expect(limits).toContain("UPLOAD_PATHS");
    expect(limits).toContain("SIGNED_WEBHOOK_PATHS");
  });
});

describe("credential endpoints", () => {
  it("does not echo the identity provider's message on a failed signup", () => {
    // Comments are stripped first: the module's own explanation quotes the old
    // line, and a guard that trips on its own documentation is noise.
    const code = read("app/api/auth/register/route.js")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    // The old line that printed "User already registered" verbatim.
    expect(code).not.toContain("fail(\"SIGNUP_FAILED\", error.message");
    expect(code).toContain("SIGNUP_UNAVAILABLE");
  });

  it("counts login and registration per account, not only per header", () => {
    for (const file of ["app/api/auth/login/route.js", "app/api/auth/register/route.js"]) {
      const src = read(file);
      expect(src, file).toContain("accountKey(body.email)");
      expect(src, file).toContain("durable: true");
    }
  });

  it("resolves the limiter key from the nearest hop, not the client-written first one", () => {
    const src = read("lib/rate-limit.js");
    expect(src).toContain("PLATFORM_IP_HEADERS");
    expect(src).toContain("chain[chain.length - 1]");
    expect(src).not.toContain("?.split(\",\")[0]?.trim() || request.headers.get(\"x-real-ip\")");
  });
});

describe("unauthenticated read surface", () => {
  const publicRoutes = [
    "app/api/health/route.js",
    "app/api/chapters/route.js",
    "app/api/public/departments/route.js",
    "app/api/public/events/route.js",
    "app/api/public/projects/route.js",
    "app/api/public/summary/route.js"
  ];

  it.each(publicRoutes)("%s has a rate budget", (file) => {
    expect(read(file)).toContain("checkRateLimit(request");
  });

  it("does not advertise the framework in responses", () => {
    expect(read("next.config.mjs")).toContain("poweredByHeader: false");
  });
});
