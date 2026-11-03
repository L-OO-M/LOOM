import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";

// Pin the boot-time contract from docs/25 §5: production must not silently run
// with missing or placeholder secrets. The helper delegates to lib/env.js, so
// these tests prove the wiring, not a second copy of the rules.

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME;
const ORIGINAL_PHASE = process.env.NEXT_PHASE;
const KEYS = [
  "DATABASE_URL",
  "DATABASE_APP_URL",
  "GITHUB_WEBHOOK_SECRET",
  "CREDENTIAL_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_TOKEN_ENCRYPTION_KEY",
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET"
];
const ORIGINAL = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(vars) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const GOOD = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres.ref:pw@host:6543/postgres",
  DATABASE_APP_URL: "postgresql://loom_app.ref:pw@host:6543/postgres",
  GITHUB_WEBHOOK_SECRET: "a-real-long-webhook-secret-value",
  CREDENTIAL_SECRET: "a-real-long-credential-secret",
  NEXT_PUBLIC_APP_URL: "https://loom.example",
  GITHUB_CLIENT_ID: "Ov23li99TESTfixtureONLY0000",
  GITHUB_CLIENT_SECRET: "0000000000000000000000000000000000000000",
  GITHUB_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  AUTH0_DOMAIN: "loom-test.au.auth0.com",
  AUTH0_CLIENT_ID: "0123456789abcdefTESTfixture",
  AUTH0_CLIENT_SECRET: "fixture-client-secret-not-real-000000000000",
  AUTH0_SECRET: "a".repeat(64)
};

async function load() {
  vi.resetModules();
  return import("@/lib/deploy-env-check");
}

describe("deploy environment check", () => {
  beforeEach(() => vi.resetModules());

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    if (ORIGINAL_RUNTIME === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME;
    if (ORIGINAL_PHASE === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = ORIGINAL_PHASE;
    for (const [k, v] of Object.entries(ORIGINAL)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("is a no-op outside production", async () => {
    setEnv({ NODE_ENV: "development" });
    const { validateDeployEnv, assertDeployEnv } = await load();
    expect(validateDeployEnv()).toEqual({ ok: true, problems: [] });
    expect(() => assertDeployEnv()).not.toThrow();
  });

  it("reports missing production configuration without throwing", async () => {
    setEnv({ NODE_ENV: "production" });
    const { validateDeployEnv } = await load();
    const result = validateDeployEnv();
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("DATABASE_URL");
    expect(result.problems.join(" ")).toContain("DATABASE_APP_URL");
  });

  it("passes for a fully configured production deploy", async () => {
    setEnv(GOOD);
    const { validateDeployEnv, assertDeployEnv } = await load();
    expect(validateDeployEnv()).toEqual({ ok: true, problems: [] });
    expect(() => assertDeployEnv()).not.toThrow();
  });

  it("throws at boot for a known placeholder signing secret", async () => {
    setEnv({ ...GOOD, GITHUB_WEBHOOK_SECRET: "dev-secret" });
    const { assertDeployEnv } = await load();
    expect(() => assertDeployEnv()).toThrow(/placeholder/);
  });

  it("does not require runtime secrets during the production build phase", async () => {
    setEnv({ NODE_ENV: "production" });
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PHASE = "phase-production-build";
    const { register } = await import("../../instrumentation");
    await expect(register()).resolves.toBeUndefined();
  });

  it("fails a serving nodejs instance with missing secrets", async () => {
    setEnv({ NODE_ENV: "production" });
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.NEXT_PHASE;
    const { register } = await import("../../instrumentation");
    await expect(register()).rejects.toThrow(/DATABASE_URL/);
  });

  it("throws at boot when DATABASE_APP_URL is omitted", async () => {
    setEnv({ ...GOOD, DATABASE_APP_URL: undefined });
    const { assertDeployEnv } = await load();
    expect(() => assertDeployEnv()).toThrow(/DATABASE_APP_URL/);
  });
});
