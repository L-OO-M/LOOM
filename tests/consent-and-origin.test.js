import { describe, expect, it, vi } from "vitest";
import { consentIsCurrent, legalConfig, POLICY_VERSIONS } from "@/lib/legal";
import { checkSameOrigin, isCsrfExempt } from "@/lib/csrf";
import { authorizeCron } from "@/lib/scheduler";

function recorder(handler = () => []) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return Promise.resolve(handler(calls[calls.length - 1]));
  };
  sql.calls = calls;
  return sql;
}

describe("consent policy", () => {
  it("accepts only the current terms and privacy pair", () => {
    expect(consentIsCurrent({ terms_version: POLICY_VERSIONS.terms, privacy_version: POLICY_VERSIONS.privacy })).toBe(true);
    expect(consentIsCurrent({ terms_version: "old", privacy_version: POLICY_VERSIONS.privacy })).toBe(false);
    expect(consentIsCurrent(null)).toBe(false);
  });

  it("never exposes bracketed legal placeholders by default", () => {
    const legal = legalConfig();
    for (const value of Object.values(legal)) {
      if (typeof value === "string") expect(value).not.toMatch(/\[[A-Z_ ]+\]/);
    }
  });

  // The first import of auth-server pulls the Auth0/Supabase clients and can be
  // slow on a cold disk; that is module loading, not a consent-record hang.
  it("records consent idempotently through the unique policy pair", async () => {
    const sql = recorder(() => []);
    const { recordConsent } = await import("@/lib/auth-server");
    await recordConsent({ sql, userId: "u1", tenantId: "t1", source: "test" });
    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].text).toContain("INSERT INTO consent_records");
    expect(sql.calls[0].text).toContain("ON CONFLICT (user_id, terms_version, privacy_version) DO NOTHING");
    expect(sql.calls[0].values).toContain(POLICY_VERSIONS.terms);
    expect(sql.calls[0].values).toContain(POLICY_VERSIONS.privacy);
  }, 15_000);

  it("fails closed when the consent lookup errors", async () => {
    const { hasCurrentConsent } = await import("@/lib/auth-server");
    const sql = () => { throw new Error("missing table"); };
    await expect(hasCurrentConsent(sql, { userId: "u1", tenantId: "t1" })).resolves.toBe(false);
  });
});

describe("CSRF origin gate", () => {
  function request({ method = "POST", origin, referer, url = "https://loom.example/api/projects" }) {
    const headers = new Headers();
    if (origin) headers.set("origin", origin);
    if (referer) headers.set("referer", referer);
    return { method, url, headers };
  }

  it("allows same-origin unsafe requests", () => {
    expect(checkSameOrigin(request({ origin: "https://loom.example" }))).toMatchObject({ ok: true });
  });

  it("rejects foreign and null origins", () => {
    expect(checkSameOrigin(request({ origin: "https://evil.example" })).ok).toBe(false);
    expect(checkSameOrigin(request({ origin: "null" })).ok).toBe(false);
  });

  it("exempts only the signed webhook path", () => {
    expect(isCsrfExempt("/api/github/webhook/")).toBe(true);
    expect(isCsrfExempt("/api/projects")).toBe(false);
    expect(checkSameOrigin(request({ origin: "https://evil.example", url: "https://loom.example/api/github/webhook" })).ok).toBe(true);
  });
});

describe("cron authorization", () => {
  function req(headers = {}) {
    return { headers: new Headers(headers) };
  }

  it("closes the endpoint when no secret is configured", () => {
    expect(authorizeCron(req({ authorization: "Bearer anything" }), undefined)).toMatchObject({ ok: false, status: 503 });
  });

  it("accepts a matching bearer and rejects a wrong or missing one", () => {
    expect(authorizeCron(req({ authorization: "Bearer cron-secret" }), "cron-secret")).toEqual({ ok: true });
    expect(authorizeCron(req({ authorization: "Bearer nope" }), "cron-secret")).toMatchObject({ ok: false, status: 401 });
    expect(authorizeCron(req(), "cron-secret")).toMatchObject({ ok: false, status: 401 });
  });
});
