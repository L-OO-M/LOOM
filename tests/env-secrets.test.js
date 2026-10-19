import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL = {};
for (const k of [
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

// A valid 32-byte base64 key. The length check in assertProductionSecrets is in
// BYTES, not characters, so a 32-character string would fail -- which is the
// point, and worth pinning with a real value rather than a shorthand.
const GOOD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const GOOD = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres.ref:pw@host:6543/postgres",
  DATABASE_APP_URL: "postgresql://loom_app.ref:pw@host:6543/postgres",
  GITHUB_WEBHOOK_SECRET: "a-real-long-webhook-secret-value",
  CREDENTIAL_SECRET: "a-real-long-credential-secret",
  NEXT_PUBLIC_APP_URL: "https://loom.example",
  // Fixture values, deliberately NOT the real credentials. A test file is
  // tracked source: putting a live client secret here publishes it to every
  // clone of the repo, and these fixtures exist only to be well-formed.
  GITHUB_CLIENT_ID: "Ov23li99TESTfixtureONLY0000",
  GITHUB_CLIENT_SECRET: "0000000000000000000000000000000000000000",
  GITHUB_TOKEN_ENCRYPTION_KEY: GOOD_ENCRYPTION_KEY,
  // Auth0 fixtures -- also deliberately fake. See the note above: this file is
  // tracked, so it must never carry live credentials.
  AUTH0_DOMAIN: "loom-test.au.auth0.com",
  AUTH0_CLIENT_ID: "0123456789abcdefTESTfixture",
  AUTH0_CLIENT_SECRET: "fixture-client-secret-not-real-000000000000",
  AUTH0_SECRET: "a".repeat(64)
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

  // Auth0 is the login front door. Missing credentials would surface as an
  // opaque 500 on /auth/login, so they are required-in-production like the rest.
  it("rejects missing Auth0 credentials", async () => {
    setEnv({ ...GOOD, AUTH0_DOMAIN: undefined, AUTH0_CLIENT_ID: undefined });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/AUTH0_DOMAIN/);
  });

  it("rejects a too-short AUTH0_SECRET, which encrypts the session cookie", async () => {
    setEnv({ ...GOOD, AUTH0_SECRET: "short" });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/AUTH0_SECRET/);
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

  // The GitHub OAuth trio was added as REQUIRED-in-production, not optional.
  // That is a deliberate choice: without a client secret, repository ownership
  // silently degrades to "asserted", and without the encryption key any token we
  // already stored becomes unreadable. Both are conditions an operator must see
  // at boot rather than discover during a support ticket.
  it("reports a missing GitHub OAuth configuration in production", async () => {
    setEnv({ ...GOOD, GITHUB_CLIENT_ID: undefined, GITHUB_CLIENT_SECRET: undefined });
    const { secretProblems } = await loadEnvModule();
    expect(secretProblems()).toContain("GITHUB_CLIENT_ID is not set");
    expect(secretProblems()).toContain("GITHUB_CLIENT_SECRET is not set");
  });

  it("reports a missing token encryption key, which would orphan stored tokens", async () => {
    setEnv({ ...GOOD, GITHUB_TOKEN_ENCRYPTION_KEY: undefined });
    const { secretProblems } = await loadEnvModule();
    expect(secretProblems()).toContain("GITHUB_TOKEN_ENCRYPTION_KEY is not set");
  });

  it("reports a missing Auth0 configuration in production", async () => {
    setEnv({ ...GOOD, AUTH0_DOMAIN: undefined, AUTH0_SECRET: undefined });
    const { secretProblems } = await loadEnvModule();
    expect(secretProblems()).toContain("AUTH0_DOMAIN is not set");
    expect(secretProblems()).toContain("AUTH0_SECRET is not set");
  });

  it("rejects an encryption key of the wrong BYTE length, not just the wrong character length", async () => {
    // 32 characters of base64 is only 24 bytes. Silently accepting it would
    // produce an AES-128 key where AES-256 was assumed, announced by nothing.
    const tooShort = Buffer.alloc(16, 3).toString("base64");
    setEnv({ ...GOOD, GITHUB_TOKEN_ENCRYPTION_KEY: tooShort });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/GITHUB_TOKEN_ENCRYPTION_KEY/);
  });

  it("rejects a known-placeholder encryption key", async () => {
    setEnv({ ...GOOD, GITHUB_TOKEN_ENCRYPTION_KEY: "changeme" });
    const { assertProductionSecrets } = await loadEnvModule();
    expect(() => assertProductionSecrets()).toThrow(/GITHUB_TOKEN_ENCRYPTION_KEY/);
  });
});