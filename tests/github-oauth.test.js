import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// lib/crypto.js reads the key through lib/env.js, whose `env` object is built
// ONCE at module load from process.env. Mutating process.env after the first
// import therefore has no effect on an already-imported module -- which is
// exactly the trap these tests initially fell into, asserting "refuses to seal
// with no key" against a module that had cached the key.
//
// So every key-dependent case re-imports through this helper. Doing it any other
// way would make these tests pass for the wrong reason.
async function loadCrypto(key) {
  if (key === undefined) delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  else process.env.GITHUB_TOKEN_ENCRYPTION_KEY = key;
  vi.resetModules();
  return await import("@/lib/crypto");
}

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

let seal;
let open;
let isStaleEnvelope;

beforeEach(async () => {
  process.env.CREDENTIAL_SECRET = "a-real-long-credential-secret";
  const mod = await loadCrypto(KEY_A);
  seal = mod.seal;
  open = mod.open;
  isStaleEnvelope = mod.isStaleEnvelope;
});

afterEach(() => {
  delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Token sealing
// ---------------------------------------------------------------------------

describe("token sealing", () => {
  it("round-trips a token", () => {
    expect(open(seal("gho_secretvalue"))).toBe("gho_secretvalue");
  });

  it("never emits the plaintext anywhere in the envelope", () => {
    const sealed = seal("gho_supersecret");
    expect(sealed).not.toContain("gho_supersecret");
    expect(sealed.startsWith("enc:v1:")).toBe(true);
  });

  it("produces a different ciphertext each time (fresh IV)", () => {
    // Reusing an IV under one key destroys GCM's guarantees; if this ever
    // collapses to one value, the implementation cached the nonce.
    expect(seal("same")).not.toBe(seal("same"));
  });

  it("fails closed on a tampered ciphertext", () => {
    const sealed = seal("gho_token");
    const parts = sealed.split(":");
    // Flip one character of the ciphertext.
    const data = parts[4];
    const flipped = data[0] === "A" ? "B" : "A";
    const tampered = [...parts.slice(0, 4), flipped + data.slice(1)].join(":");
    expect(() => open(tampered)).toThrow();
  });

  it("fails closed when the authentication tag is swapped", () => {
    const a = seal("one").split(":");
    const b = seal("two").split(":");
    const forged = [a[0], a[1], a[2], b[3], a[4]].join(":");
    expect(() => open(forged)).toThrow();
  });

  it("fails closed under a different key", async () => {
    // AES-GCM cannot distinguish "wrong key" from "tampered ciphertext" — both
    // fail authentication identically. That is a feature: neither is ever
    // silently accepted, and neither can be reported as "probably fine".
    const sealed = seal("gho_token");
    const other = await loadCrypto(KEY_B);
    expect(() => other.open(sealed)).toThrow(/authenticate|Unsupported state/i);
  });

  it("flags an envelope from an older key version as stale, not corrupt", async () => {
    // Rotation is the case where the prefix earns its keep. A v2 envelope under
    // a v1 key must say "rotate", because an operator facing an unreadable token
    // needs to know whether to re-seal it or investigate corruption.
    const sealed = seal("gho_token");
    const bumped = sealed.replace(/^enc:v1:/, "enc:v2:");
    expect(isStaleEnvelope(bumped)).toBe(true);
    expect(isStaleEnvelope(sealed)).toBe(false);
    expect(() => open(bumped)).toThrow(/version/i);
  });

  it("rejects a non-envelope value outright", () => {
    // A plaintext token left behind by an earlier deploy must never be treated
    // as decryptable.
    expect(() => open("gho_rawtoken")).toThrow();
    expect(isStaleEnvelope("gho_rawtoken")).toBe(true);
  });

  it("refuses to seal with no key at all", async () => {
    const none = await loadCrypto(undefined);
    expect(none.cryptoConfigured()).toBe(false);
    expect(() => none.seal("x")).toThrow(/GITHUB_TOKEN_ENCRYPTION_KEY/);
  });

  it("refuses a placeholder key rather than sealing with it", async () => {
    // Sealing with a published key would look configured while being readable
    // by anyone who read .env.example.
    const weak = await loadCrypto("changeme");
    expect(weak.cryptoConfigured()).toBe(false);
    expect(() => weak.seal("x")).toThrow();
  });

  it("refuses a key of the wrong byte length instead of truncating", async () => {
    const short = await loadCrypto(Buffer.alloc(16, 3).toString("base64"));
    expect(short.cryptoConfigured()).toBe(false);
  });

  it("binds ciphertext to its purpose via AAD", () => {
    const sealed = seal("gho_token");
    // A value sealed for the GitHub column must not open under a different
    // purpose, or a column swap decrypts into something meaningful.
    expect(() => open(sealed, "loom.something_else")).toThrow();
  });

  it("rejects empty and non-string input", () => {
    expect(() => seal("")).toThrow();
    expect(() => seal(null)).toThrow();
    expect(() => open("")).toThrow();
    expect(() => open("not-an-envelope")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// OAuth state — the CSRF defence
// ---------------------------------------------------------------------------

describe("oauth state", () => {
  let signState;
  let verifyState;

  beforeEach(async () => {
    const mod = await import("@/lib/github-oauth");
    signState = mod.signState;
    verifyState = mod.verifyState;
  });

  it("round-trips a fresh state", () => {
    const state = signState({ userId: "u1", nonce: "n1" });
    const out = verifyState({ state, expectedUserId: "u1" });
    expect(out.ok).toBe(true);
    expect(out.userId).toBe("u1");
    expect(out.nonce).toBe("n1");
  });

  it("rejects state issued for a different user", () => {
    // THE csrf property: a valid signature from one account must not complete a
    // flow for another.
    const state = signState({ userId: "alice", nonce: "n1" });
    const out = verifyState({ state, expectedUserId: "mallory" });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("USER_MISMATCH");
  });

  it("rejects a tampered payload", () => {
    const state = signState({ userId: "u1", nonce: "n1" });
    const [payload, sig] = state.split(".");
    const forged = `${payload}x.${sig}`;
    expect(verifyState({ state: forged, expectedUserId: "u1" }).ok).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const state = signState({ userId: "u1", nonce: "n1" });
    const [payload] = state.split(".");
    expect(verifyState({ state: `${payload}.deadbeef`, expectedUserId: "u1" }).ok).toBe(false);
  });

  it("expires a state past its TTL", () => {
    const state = signState({ userId: "u1", nonce: "n1" });
    const elevenMinutes = Date.now() + 11 * 60 * 1000;
    const out = verifyState({ state, expectedUserId: "u1", now: elevenMinutes });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("EXPIRED");
  });

  it("rejects missing and malformed state without throwing", () => {
    // A public callback gets probed by bots and stale tabs; neither may 500.
    expect(verifyState({ state: null }).reason).toBe("MISSING");
    expect(verifyState({ state: "garbage" }).reason).toBe("MALFORMED");
    expect(verifyState({ state: "a.b.c" }).reason).toBe("MALFORMED");
  });

  it("does not leak the signing secret into the state value", () => {
    const state = signState({ userId: "u1", nonce: "n1" });
    expect(state).not.toContain("a-real-long-credential-secret");
  });
});

// ---------------------------------------------------------------------------
// Webhook installation — the double-count hazard
// ---------------------------------------------------------------------------

describe("ensureWebhook", () => {
  let ensureWebhook;

  beforeEach(async () => {
    const mod = await import("@/lib/github-oauth");
    ensureWebhook = mod.ensureWebhook;
  });

  const ok = (data) => ({ ok: true, status: 200, data });
  const fail = (status) => ({ ok: false, status, data: null });

  it("installs when no matching hook exists", async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, method: opts?.method || "GET" });
      if (!opts?.method || opts.method === "GET") return { ok: true, json: async () => [] };
      return { ok: true, status: 201, json: async () => ({ id: 7 }) };
    };
    const res = await ensureWebhook({
      accessToken: "t", fullName: "a/b", webhookUrl: "https://loom.example/api/github/webhook",
      secret: "s", fetchImpl
    });
    expect(res.ok).toBe(true);
    expect(res.installed).toBe(true);
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });

  it("SKIPS installation when our webhook is already there", async () => {
    // The regression this guards: GitHub delivers one payload PER HOOK, and a
    // duplicate hook yields two DIFFERENT delivery ids for the same push. The
    // ingest dedupes on delivery id, so it cannot detect that — every commit
    // would be counted twice with nobody cheating.
    const methods = [];
    const fetchImpl = async (url, opts) => {
      methods.push(opts?.method || "GET");
      return {
        ok: true,
        status: 200,
        json: async () => [{ config: { url: "https://loom.example/api/github/webhook" } }]
      };
    };
    const res = await ensureWebhook({
      accessToken: "t", fullName: "a/b", webhookUrl: "https://loom.example/api/github/webhook",
      secret: "s", fetchImpl
    });
    expect(res.ok).toBe(true);
    expect(res.installed).toBe(false);
    expect(res.alreadyPresent).toBe(true);
    expect(methods).not.toContain("POST");
  });

  it("still installs when a DIFFERENT webhook exists", async () => {
    let posted = false;
    const fetchImpl = async (url, opts) => {
      if (opts?.method === "POST") {
        posted = true;
        return { ok: true, status: 201, json: async () => ({ id: 9 }) };
      }
      return { ok: true, json: async () => [{ config: { url: "https://someone.else/hook" } }] };
    };
    const res = await ensureWebhook({
      accessToken: "t", fullName: "a/b", webhookUrl: "https://loom.example/api/github/webhook",
      secret: "s", fetchImpl
    });
    expect(res.installed).toBe(true);
    expect(posted).toBe(true);
  });

  it("skips rather than guessing when it cannot list hooks", async () => {
    // A missing hook is recoverable by hand; a duplicate one corrupts scores
    // silently. When in doubt, do nothing.
    const fetchImpl = async () => fail(403);
    const res = await ensureWebhook({
      accessToken: "t", fullName: "a/b", webhookUrl: "https://loom.example/api/github/webhook",
      secret: "s", fetchImpl
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("NEEDS_ADMIN");
  });

  it("refuses a non-http webhook URL", async () => {
    const res = await ensureWebhook({
      accessToken: "t", fullName: "a/b", webhookUrl: "javascript:alert(1)", secret: "s",
      fetchImpl: async () => ok([])
    });
    expect(res.reason).toBe("INVALID_WEBHOOK_URL");
  });

  it("subscribes to push and pull_request only", async () => {
    let body = null;
    const fetchImpl = async (url, opts) => {
      if (opts?.method === "POST") body = JSON.parse(opts.body);
      return { ok: true, status: 201, json: async () => ({}) };
    };
    await ensureWebhook({
      accessToken: "t", fullName: "a/b", webhookUrl: "https://loom.example/api/github/webhook",
      secret: "s", fetchImpl
    });
    expect(body.events.sort()).toEqual(["pull_request", "push"]);
  });
});

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

describe("exchangeCode", () => {
  let exchangeCode;

  beforeEach(async () => {
    const mod = await import("@/lib/github-oauth");
    exchangeCode = mod.exchangeCode;
  });

  it("returns a token on success", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ access_token: "gho_x", scope: "repo,read:user", expires_in: 28800 })
    });
    const res = await exchangeCode({
      code: "c", clientId: "i", clientSecret: "s", redirectUri: "https://x/cb", fetchImpl
    });
    expect(res.ok).toBe(true);
    expect(res.accessToken).toBe("gho_x");
    expect(res.scopes).toEqual(["repo", "read:user"]);
    expect(res.expiresIn).toBe(28800);
  });

  it("never leaks the client secret or the response body on failure", async () => {
    // A raw error body has been committed to this repo's history before; the
    // token endpoint echoes client input back in error_description.
    //
    // The sentinel is a fixture, never the live credential — this file is
    // tracked source, so a real secret here would publish it.
    const SENTINEL = "FIXTURE-SECRET-MUST-NOT-LEAK-0123456789";
    const fetchImpl = async () => ({
      ok: false,
      json: async () => ({ error: "bad_verification_code", error_description: `code ${SENTINEL} is expired` })
    });
    const res = await exchangeCode({
      code: "s", clientId: "i", clientSecret: SENTINEL,
      redirectUri: "https://x/cb", fetchImpl
    });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain(SENTINEL);
    expect(res.reason).toBe("EXCHANGE_FAILED");
  });

  it("distinguishes a bad client from a spent code", async () => {
    const fetchImpl = async () => ({
      ok: false, json: async () => ({ error: "incorrect_client_credentials" })
    });
    const res = await exchangeCode({
      code: "c", clientId: "i", clientSecret: "wrong", redirectUri: "https://x/cb", fetchImpl
    });
    expect(res.reason).toBe("BAD_CLIENT");
  });

  it("reports missing configuration rather than calling GitHub", async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    const res = await exchangeCode({
      code: "c", clientId: "", clientSecret: "", redirectUri: "https://x/cb", fetchImpl
    });
    expect(res.reason).toBe("OAUTH_NOT_CONFIGURED");
    expect(called).toBe(false);
  });

  it("survives a network failure without throwing", async () => {
    const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
    const res = await exchangeCode({
      code: "c", clientId: "i", clientSecret: "s", redirectUri: "https://x/cb", fetchImpl
    });
    expect(res.reason).toBe("NETWORK");
  });
});

// ---------------------------------------------------------------------------
// Identity extraction from a Supabase session
// ---------------------------------------------------------------------------

describe("extractGitHubIdentity", () => {
  let extractGitHubIdentity;

  beforeEach(async () => {
    const mod = await import("@/lib/github-identity");
    extractGitHubIdentity = mod.extractGitHubIdentity;
  });

  it("reads the login from user_metadata", () => {
    const out = extractGitHubIdentity({
      app_metadata: { provider: "github", providers: ["github"] },
      user_metadata: { user_name: "asha", id: 42 }
    });
    expect(out.login).toBe("asha");
    expect(out.githubUserId).toBe(42);
  });

  it("reads the immutable id from identities[].provider_id", () => {
    const out = extractGitHubIdentity({
      app_metadata: { provider: "github" },
      identities: [{ provider: "github", provider_id: "98765" }],
      user_metadata: { user_name: "asha" }
    });
    expect(out.githubUserId).toBe(98765);
  });

  it("returns nothing for a NON-github sign-in", () => {
    // Critical: an email/password user whose name happens to look like a GitHub
    // handle must never be recorded as having a verified GitHub identity.
    const out = extractGitHubIdentity({
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { user_name: "asha", id: 7 }
    });
    expect(out.login).toBeNull();
    expect(out.githubUserId).toBeNull();
  });

  it("is honest when the id is absent rather than inventing one", () => {
    const out = extractGitHubIdentity({
      app_metadata: { provider: "github" },
      user_metadata: { user_name: "asha" }
    });
    expect(out.login).toBe("asha");
    // NULL is the honest state; the UI then says "not verified by GitHub".
    expect(out.githubUserId).toBeNull();
  });

  it("never throws on an unexpected shape", () => {
    expect(extractGitHubIdentity(null).login).toBeNull();
    expect(extractGitHubIdentity({}).login).toBeNull();
    expect(extractGitHubIdentity({ app_metadata: { provider: "github" } }).login).toBeNull();
  });

  it("ignores a non-numeric id", () => {
    const out = extractGitHubIdentity({
      app_metadata: { provider: "github" },
      user_metadata: { user_name: "asha", id: "not-a-number" }
    });
    expect(out.githubUserId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Routing invariants
// ---------------------------------------------------------------------------

describe("oauth routes are not publicly reachable", () => {
  it("keeps the OAuth start and callback out of the middleware allow-list", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const mw = readFileSync(join(process.cwd(), "middleware.js"), "utf8");
    const publicBlock = mw.slice(mw.indexOf("const publicPaths"), mw.indexOf("];"));
    // Both REQUIRE a session: state is bound to a user id, and the callback
    // writes github_connections for that user. Making them public would let
    // anyone start a flow that lands on a stranger's account.
    expect(publicBlock).not.toContain("/api/github/oauth/start");
    expect(publicBlock).not.toContain("/api/github/oauth/callback");
    // The webhook is public by design -- GitHub has no session.
    expect(publicBlock).toContain("/api/github/webhook");
  });
});