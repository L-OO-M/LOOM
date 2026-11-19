import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeVerificationToken,
  createVerificationToken,
  emailProviderName,
  hashToken,
  maskEmail,
  sendVerificationEmail,
  verificationConfigured
} from "@/lib/email-verification";

// Email verification is optional, but the token mechanics are not: tokens are
// single-use, stored only as a SHA-256 hash, and consumed in one transaction so
// two concurrent clicks cannot both verify. These tests exercise that boundary
// without a live provider or database.

const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "NEXT_PUBLIC_APP_URL", "APP_BASE_URL"];
let savedEnv = {};

/** Tagged-template double that records SQL and returns queued results. */
function makeSql(results = []) {
  const calls = [];
  const queue = [...results];
  function sql(strings, ...values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(queue.length ? queue.shift() : []);
  }
  sql.calls = calls;
  sql.begin = async (fn) => {
    const tx = (strings, ...values) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ text, values, tx: true });
      return Promise.resolve(queue.length ? queue.shift() : []);
    };
    return fn(tx);
  };
  return sql;
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("provider configuration", () => {
  it("is off until both the API key and sender are set", () => {
    expect(verificationConfigured()).toBe(false);
    expect(emailProviderName()).toBe(null);
    process.env.RESEND_API_KEY = "re_test";
    expect(verificationConfigured()).toBe(false);
    process.env.EMAIL_FROM = "LOOM <noreply@lets-loom.xyz>";
    expect(verificationConfigured()).toBe(true);
    expect(emailProviderName()).toBe("resend");
  });
});

describe("hashToken", () => {
  it("produces a deterministic sha256 hex digest", () => {
    const hash = hashToken("abc123");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken("abc123"));
    expect(hash).not.toBe(hashToken("abc124"));
  });

  it("never returns the raw token", () => {
    const raw = "a".repeat(64);
    expect(hashToken(raw)).not.toBe(raw);
  });

  it("stringifies non-string input before hashing", () => {
    expect(hashToken(42)).toBe(hashToken("42"));
  });
});

describe("maskEmail", () => {
  it("keeps the first two local characters and the full domain", () => {
    const masked = maskEmail("asha.rao@college.edu");
    expect(masked.startsWith("as")).toBe(true);
    expect(masked.endsWith("@college.edu")).toBe(true);
    expect(masked).not.toContain("asha.rao");
  });

  it("never reveals a short local part in full", () => {
    expect(maskEmail("a@b")).not.toBe("a@b");
    expect(maskEmail("ab@b")).not.toBe("ab@b");
    expect(maskEmail("a@b")).toMatch(/@b$/);
  });

  it("caps the mask length for long local parts", () => {
    const masked = maskEmail("averyveryverylonglocalpart@domain.test");
    const local = masked.slice(0, masked.indexOf("@"));
    expect(local.length).toBeLessThanOrEqual(8);
  });

  it("returns the neutral fallback for malformed input", () => {
    for (const value of ["", "no-at-sign", "@domain", "local@", null, undefined]) {
      expect(maskEmail(value)).toBe("your email");
    }
  });
});

describe("createVerificationToken", () => {
  it("invalidates older unused tokens before inserting the new hash", async () => {
    const sql = makeSql();
    const result = await createVerificationToken({
      sql,
      userId: "u1",
      tenantId: "t1",
      email: "Asha@College.EDU"
    });

    expect(sql.calls).toHaveLength(2);
    expect(sql.calls[0].text).toMatch(/UPDATE email_verification_tokens/);
    expect(sql.calls[0].text).toMatch(/SET used_at = NOW\(\)/);
    expect(sql.calls[0].values).toEqual(["u1"]);
    expect(sql.calls[1].text).toMatch(/INSERT INTO email_verification_tokens/);
    expect(sql.calls[1].values).toContain("asha@college.edu");

    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 25 * 60 * 60 * 1000);
  });

  it("stores only the hash, never the raw token", async () => {
    const sql = makeSql();
    const { token } = await createVerificationToken({
      sql,
      userId: "u1",
      tenantId: null,
      email: "a@b.test"
    });
    const inserted = sql.calls[1];
    expect(inserted.values).toContain(hashToken(token));
    expect(inserted.values).not.toContain(token);
    expect(inserted.values).toContain(null);
  });
});

describe("consumeVerificationToken", () => {
  it("rejects a short or non-string token before touching the database", async () => {
    for (const raw of [null, undefined, "", "short", 123456789012345678901234567890123]) {
      const sql = makeSql();
      await expect(consumeVerificationToken({ sql, raw })).resolves.toEqual({
        ok: false,
        reason: "invalid"
      });
      expect(sql.calls).toHaveLength(0);
    }
  });

  it("consumes and verifies in one transaction", async () => {
    const sql = makeSql([
      [{ user_id: "u1", email: "a@b.test" }], // UPDATE ... RETURNING
      [] // UPDATE profiles
    ]);
    const result = await consumeVerificationToken({ sql, raw: "a".repeat(64) });
    expect(result).toEqual({ ok: true, userId: "u1", email: "a@b.test" });
    expect(sql.calls[0].text).toMatch(/UPDATE email_verification_tokens/);
    expect(sql.calls[0].text).toMatch(/used_at IS NULL/);
    expect(sql.calls[0].text).toMatch(/expires_at > NOW\(\)/);
    expect(sql.calls[1].text).toMatch(/UPDATE profiles/);
    expect(sql.calls[1].values).toContain("u1");
  });

  it("reports invalid when the token was already used", async () => {
    const sql = makeSql([
      [], // UPDATE found nothing
      [{ used_at: new Date(), expires_at: new Date(Date.now() + 1000) }]
    ]);
    await expect(consumeVerificationToken({ sql, raw: "b".repeat(64) })).resolves.toEqual({
      ok: false,
      reason: "invalid"
    });
    expect(sql.calls).toHaveLength(2);
  });

  it("reports expired when the token exists but is unused", async () => {
    const sql = makeSql([
      [],
      [{ used_at: null, expires_at: new Date(Date.now() - 1000) }]
    ]);
    await expect(consumeVerificationToken({ sql, raw: "c".repeat(64) })).resolves.toEqual({
      ok: false,
      reason: "expired"
    });
  });

  it("reports invalid when the token does not exist at all", async () => {
    const sql = makeSql([[], []]);
    await expect(consumeVerificationToken({ sql, raw: "d".repeat(64) })).resolves.toEqual({
      ok: false,
      reason: "invalid"
    });
  });
});

describe("sendVerificationEmail", () => {
  it("returns NOT_CONFIGURED instead of throwing when no provider is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendVerificationEmail({ to: "a@b.test", token: "tok", name: "Asha" });
    expect(result).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one message with a single-use link to the canonical origin", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "LOOM <noreply@lets-loom.xyz>";
    process.env.NEXT_PUBLIC_APP_URL = "https://lets-loom.xyz";

    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendVerificationEmail({
      to: "asha@college.edu",
      token: "raw token/with+chars",
      name: "Asha Rao"
    });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["asha@college.edu"]);
    expect(body.subject).toBe("Confirm your LOOM email");
    expect(body.text).toContain("Hi Asha,");
    expect(body.text).toContain(
      "https://lets-loom.xyz/api/auth/verify-email/confirm?token=raw%20token%2Fwith%2Bchars"
    );
    expect(body.text).toContain("works once");
    expect(body.text).not.toContain("<html");
  });

  it("escapes a hostile display name in the HTML body", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@lets-loom.xyz";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    await sendVerificationEmail({ to: "a@b.test", token: "t", name: "<img src=x onerror=alert(1)>" });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(body.html).not.toContain("<img");
    expect(body.html).toContain("&lt;img");
  });

  it("uses a neutral greeting when no name is available", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@lets-loom.xyz";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    await sendVerificationEmail({ to: "a@b.test", token: "t" });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(body.text.startsWith("Hi,")).toBe(true);
  });

  it("surfaces the provider status without echoing its body", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@lets-loom.xyz";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => "secret provider detail"
    })));
    const result = await sendVerificationEmail({ to: "a@b.test", token: "t" });
    expect(result).toMatchObject({ ok: false, code: "EMAIL_422" });
    expect(JSON.stringify(result)).not.toContain("secret provider detail");
  });

  it("distinguishes a timeout from an unreachable provider", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "noreply@lets-loom.xyz";

    vi.stubGlobal("fetch", vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    }));
    expect(await sendVerificationEmail({ to: "a@b.test", token: "t" })).toMatchObject({
      ok: false,
      code: "EMAIL_TIMEOUT"
    });

    vi.stubGlobal("fetch", vi.fn(async () => {
      const error = new Error("socket hang up");
      error.name = "AbortError";
      throw error;
    }));
    expect(await sendVerificationEmail({ to: "a@b.test", token: "t" })).toMatchObject({
      ok: false,
      code: "EMAIL_TIMEOUT"
    });

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ENOTFOUND");
    }));
    expect(await sendVerificationEmail({ to: "a@b.test", token: "t" })).toMatchObject({
      ok: false,
      code: "EMAIL_UNREACHABLE"
    });
  });
});
