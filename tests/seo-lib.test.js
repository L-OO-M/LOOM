import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
  canonicalFor,
  defaultTenantSlug,
  siteUrl
} from "@/lib/seo";

// Canonical URLs are the SEO contract: exactly one absolute origin per page,
// never a relative path and never a staging host borrowed from the environment.
// `appBaseUrl` itself is covered in app-url.test.js; this file covers the
// page-facing helpers built on top of it.

const KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "APP_BASE_URL",
  "DEFAULT_TENANT_SLUG",
  "DEV_TENANT_SLUG"
];
const saved = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("site identity", () => {
  it("keeps non-empty product constants", () => {
    expect(SITE_NAME).toBe("LOOM");
    expect(SITE_TAGLINE).toMatch(/Learn\. Build\. Prove\. Connect\./);
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(80);
  });
});

describe("siteUrl", () => {
  it("uses the configured public origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz";
    expect(siteUrl()).toBe("https://lets-loom.xyz");
  });

  it("falls back to localhost during tests and local builds", () => {
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("absoluteUrl", () => {
  it("joins rooted paths without doubling the slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz";
    expect(absoluteUrl("/events")).toBe("https://lets-loom.xyz/events");
    expect(absoluteUrl("/")).toBe("https://lets-loom.xyz/");
  });

  it("adds the missing leading slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz";
    expect(absoluteUrl("verify/credential/cred_1")).toBe(
      "https://lets-loom.xyz/verify/credential/cred_1"
    );
  });

  it("defaults to the origin root", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz";
    expect(absoluteUrl()).toBe("https://lets-loom.xyz/");
  });

  it("normalises trailing slashes in the origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz///";
    expect(absoluteUrl("/faq")).toBe("https://lets-loom.xyz/faq");
  });

  it("keeps query strings and encoded segments intact", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz";
    expect(absoluteUrl("/u/aanya%20dev?tab=projects")).toBe(
      "https://lets-loom.xyz/u/aanya%20dev?tab=projects"
    );
  });
});

describe("canonicalFor", () => {
  it("returns the metadata shape Next expects", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz";
    expect(canonicalFor("/about")).toEqual({
      alternates: { canonical: "https://lets-loom.xyz/about" }
    });
    expect(canonicalFor("/").alternates.canonical).toBe("https://lets-loom.xyz/");
  });
});

describe("defaultTenantSlug", () => {
  it("prefers DEFAULT_TENANT_SLUG over DEV_TENANT_SLUG", () => {
    process.env.DEFAULT_TENANT_SLUG = "primary";
    process.env.DEV_TENANT_SLUG = "dev";
    expect(defaultTenantSlug()).toBe("primary");
  });

  it("falls back to DEV_TENANT_SLUG", () => {
    process.env.DEV_TENANT_SLUG = "dev";
    expect(defaultTenantSlug()).toBe("dev");
  });

  it("returns null rather than inventing a chapter", () => {
    expect(defaultTenantSlug()).toBe(null);
  });

  it("treats an empty env value as unset", () => {
    process.env.DEFAULT_TENANT_SLUG = "";
    process.env.DEV_TENANT_SLUG = "dev";
    expect(defaultTenantSlug()).toBe("dev");
  });
});
