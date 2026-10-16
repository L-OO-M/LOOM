import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL = {};
for (const k of [
  "DATABASE_URL",
  "DATABASE_APP_URL",
  "GITHUB_WEBHOOK_SECRET",
  "CREDENTIAL_SECRET",
  "NEXT_PUBLIC_APP_URL"
]) {
  ORIGINAL[k] = process.env[k];
}

function setEnv(vars) {
  for (const k of Object.keys(ORIGINAL)) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    // Assigning undefined to process.env stores the STRING "undefined", which
    // is truthy and would defeat every missing-variable assertion below.
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
  NEXT_PUBLIC_APP_URL: "https://loom.example"
};

async function loadEnvModule() {
  vi.resetModules();
  return await import("@/lib/env");
}

describe("assertProductionSecrets", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    for (const [k, v] of Object.entries(ORIGINAL)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("passes when every secret is present and non-placeholder", async () => {
    setEnv(GOOD);
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it("is a no-op outside production", async () => {
    setEnv({ NODE_ENV: "development" }); // no secrets at all
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  // The bug this closes: the old check only tested truthiness, so an explicitly
  // set placeholder sailed through. `.env.example` ships dev-secret as the
  // example value, so this was the path of least resistance.
  for (const placeholder of ["dev-secret", "hello", "secret", "changeme"]) {
    it(`rejects GITHUB_WEBHOOK_SECRET=${placeholder}`, async () => {
      setEnv({ ...GOOD, GITHUB_WEBHOOK_SECRET: placeholder });
      const { assertProductionSecrets } = await loadEnvModule();
      expect(() => assertProductionSecrets()).toThrow(/placeholder/);
    });
  }

  it("rejects a placeholder CREDENTIAL_SECRET", async () => {
    setEnv({ ...GOOD, CREDENTIAL_SECRET: "hello" });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/placeholder/);
  });

  it("rejects a too-short signing secret", async () => {
    setEnv({ ...GOOD, GITHUB_WEBHOOK_SECRET: "short123" });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/shorter than/);
  });

  it("rejects a missing GITHUB_WEBHOOK_SECRET", async () => {
    setEnv({ ...GOOD, GITHUB_WEBHOOK_SECRET: undefined });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/GITHUB_WEBHOOK_SECRET/);
  });

  it("rejects a missing DATABASE_APP_URL, which would silently bypass RLS", async () => {
    setEnv({ ...GOOD, DATABASE_APP_URL: undefined });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/DATABASE_APP_URL/);
  });

  it("rejects a missing NEXT_PUBLIC_APP_URL, which would publish localhost canonicals", async () => {
    setEnv({ ...GOOD, NEXT_PUBLIC_APP_URL: undefined });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("reports every problem at once rather than one per deploy cycle", async () => {
    setEnv({ NODE_ENV: "production" });
    const { assertProductionSecrets } = await loadEnvModule();
    let message = "";
    try {
      assertProductionSecrets();
    } catch (e) {
      message = e.message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("GITHUB_WEBHOOK_SECRET");
    expect(message).toContain("DATABASE_APP_URL");
    expect(message).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("exposes placeholder values to CREDENTIAL_SECRET via env", async () => {
    setEnv({ ...GOOD, CREDENTIAL_SECRET: "explicit-credential-secret-value" });
    const { env } = await loadEnvModule();
    expect(env.CREDENTIAL_SECRET).toBe("explicit-credential-secret-value");
  });
});

describe("secretProblems", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is empty in development regardless of configuration", async () => {
    setEnv({ NODE_ENV: "development" });
    const { secretProblems } = await loadEnvModule();
    expect(secretProblems()).toEqual([]);
  });

  it("lists configuration problems in production instead of throwing", async () => {
    setEnv({ ...GOOD, GITHUB_WEBHOOK_SECRET: "hello" });
    const { secretProblems } = await loadEnvModule();
    expect(secretProblems()).toContain("GITHUB_WEBHOOK_SECRET is a placeholder");
  });

  it("is empty for a fully configured production deploy", async () => {
    setEnv(GOOD);
    const { secretProblems } = await loadEnvModule();
    expect(secretProblems()).toEqual([]);
  });
});