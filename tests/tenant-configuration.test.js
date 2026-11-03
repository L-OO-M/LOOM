import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(path, "utf8");

const RUNTIME_FILES = [
  "lib/env.js",
  "lib/tenant.js",
  "lib/db.js",
  "lib/seo.js",
  "lib/auth-server.js",
  "app/(auth)/register/page.jsx",
  "app/(auth)/login/page.jsx",
  "app/domains/[slug]/page.jsx",
  "app/api/health/route.js",
  "app/events/_components/EventsCalendar.jsx",
  "app/events/_components/EventBits.jsx",
  "load/seed-control-plane.js",
  "load/seed-community.js",
  "load/seed-dev.js",
  "load/seed-e2e-student.js",
  "load/enable-verified-ranking.js",
  "load/verify-rls.js"
];

describe("tenant configuration", () => {
  it("does not hardcode a demo chapter in runtime code or seeds", () => {
    for (const file of RUNTIME_FILES) {
      expect(read(file), file).not.toMatch(/demo[-_]college/);
    }
  });

  it("resolves a new profile's chapter from the request, not a fallback row", () => {
    const auth = read("lib/auth-server.js");
    expect(auth).toMatch(/const tenant = await resolveRequestTenant\(\)/);
    expect(auth).not.toMatch(/UPDATE profiles SET tenant_id/);
  });
});
