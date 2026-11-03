import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, newRequestId, requestIdFrom } from "@/lib/log";

// Every emitter writes one JSON line through console.<level>. Spy all four and
// read the line back as data — no DOM, no network, no timers.
let lines;

function capture(level) {
  return (...args) => {
    expect(args).toHaveLength(1);
    lines.push({ level, line: JSON.parse(args[0]) });
  };
}

beforeEach(() => {
  lines = [];
  vi.spyOn(console, "debug").mockImplementation(capture("debug"));
  vi.spyOn(console, "info").mockImplementation(capture("info"));
  vi.spyOn(console, "warn").mockImplementation(capture("warn"));
  vi.spyOn(console, "error").mockImplementation(capture("error"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("newRequestId", () => {
  it("returns a short hex id", () => {
    const id = newRequestId();
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(newRequestId()).not.toBe(id);
  });
});

describe("requestIdFrom", () => {
  it("prefers x-request-id", () => {
    const request = { headers: new Headers({ "x-request-id": "req-1", "x-vercel-id": "vercel-1" }) };
    expect(requestIdFrom(request)).toBe("req-1");
  });

  it("falls back to x-vercel-id", () => {
    const request = { headers: new Headers({ "x-vercel-id": "vercel-1" }) };
    expect(requestIdFrom(request)).toBe("vercel-1");
  });

  it("tolerates a missing request or missing headers", () => {
    expect(requestIdFrom()).toMatch(/^[0-9a-f]{12}$/);
    expect(requestIdFrom({})).toMatch(/^[0-9a-f]{12}$/);
    expect(requestIdFrom({ headers: null })).toMatch(/^[0-9a-f]{12}$/);
  });

  it("reads headers from a plain object case-insensitively", () => {
    expect(requestIdFrom({ headers: { "X-Request-Id": "plain-id" } })).toBe("plain-id");
  });
});

describe("createLogger", () => {
  it("emits exactly one JSON line with level, scope, msg, ts and requestId", () => {
    const log = createLogger("jobs", { requestId: "req-9" });
    log.warn("slow job", { job: "retention-prune" });

    expect(lines).toHaveLength(1);
    const { line } = lines[0];
    expect(line.level).toBe("warn");
    expect(line.scope).toBe("jobs");
    expect(line.msg).toBe("slow job");
    expect(line.requestId).toBe("req-9");
    expect(line.job).toBe("retention-prune");
    expect(Number.isNaN(Date.parse(line.ts))).toBe(false);
    expect(new Date(line.ts).toISOString()).toBe(line.ts);
  });

  it("omits requestId when none is supplied", () => {
    createLogger("jobs").info("hello");
    expect(lines[0].line).not.toHaveProperty("requestId");
  });

  it("propagates requestId and merged fields through child()", () => {
    const parent = createLogger("jobs", { requestId: "req-child", env: "test" });
    const child = parent.child({ job: "analytics-rollup" });
    child.info("started");
    parent.info("parent line");

    expect(lines[0].line.requestId).toBe("req-child");
    expect(lines[0].line.scope).toBe("jobs");
    expect(lines[0].line.job).toBe("analytics-rollup");
    expect(lines[0].line.env).toBe("test");
    expect(lines[1].line).not.toHaveProperty("job");

    const renamed = parent.child({ scope: "jobs.rollup", job: "term-expiry" });
    renamed.info("renamed");
    expect(lines[2].line.scope).toBe("jobs.rollup");
    expect(lines[2].line.requestId).toBe("req-child");
  });

  it("masks every secret-bearing key, including nested objects and arrays", () => {
    const log = createLogger("auth", { requestId: "req-redact" });
    log.info("login", {
      email: "student@example.edu",
      password: "hunter2",
      pass: "hunter3",
      secret: "cron-secret-value",
      token: "eyJhbGciOi",
      authorization: "Bearer abc123",
      cookie: "session=xyz",
      apiKey: "sk-live",
      "api-key": "sk-live-2",
      api_key: "sk-live-3",
      session: "sess-value",
      sessionId: "sess-id",
      nested: { password: "deep", ok: "kept" },
      list: [{ token: "in-array" }, { Authorization: "Bearer z" }, "plain"],
      headers: { Cookie: "a=b", "x-request-id": "kept" }
    });

    const { line } = lines[0];
    expect(line.email).toBe("student@example.edu");
    for (const key of [
      "password", "pass", "secret", "token", "authorization", "cookie",
      "apiKey", "api-key", "api_key", "session", "sessionId"
    ]) {
      expect(line[key]).toBe("[redacted]");
    }
    expect(line.nested).toEqual({ password: "[redacted]", ok: "kept" });
    expect(line.list[0]).toEqual({ token: "[redacted]" });
    expect(line.list[1]).toEqual({ Authorization: "[redacted]" });
    expect(line.list[2]).toBe("plain");
    expect(line.headers).toEqual({ Cookie: "[redacted]", "x-request-id": "kept" });

    // No raw secret may survive anywhere in the serialised line.
    const serialised = JSON.stringify(line);
    for (const secret of ["hunter2", "hunter3", "cron-secret-value", "Bearer abc123", "sk-live", "in-array", "deep"]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it("masks secrets in the logger's base fields", () => {
    createLogger("cron", { requestId: "r", authorization: "Bearer top-secret" }).info("tick");
    expect(lines[0].line.authorization).toBe("[redacted]");
    expect(JSON.stringify(lines[0].line)).not.toContain("top-secret");
  });

  it("flattens an Error to name, message and stack", () => {
    const log = createLogger("jobs", { requestId: "req-err" });
    const cause = new Error("db down");
    log.error("job failed", { job: "term-expiry", err: cause, error: cause });

    const { line } = lines[0];
    expect(line.level).toBe("error");
    expect(line.job).toBe("term-expiry");
    expect(line.err).toEqual({ name: "Error", message: "db down", stack: cause.stack });
    expect(typeof line.err.stack).toBe("string");
    expect(line.error).toEqual({ name: "Error", message: "db down", stack: cause.stack });
    expect(JSON.stringify(line)).not.toContain('"err":{}');
  });

  it("survives cycles without throwing", () => {
    const node = { name: "root" };
    node.self = node;
    createLogger("jobs").info("cycle", { node });
    expect(lines[0].line.node.self).toBe("[circular]");
  });

  it("filters by LOG_LEVEL, defaulting to info", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    const log = createLogger("jobs", { requestId: "req-level" });
    log.debug("quiet");
    log.info("quiet");
    log.warn("quiet");
    log.error("loud");

    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe("error");
    expect(lines[0].line.msg).toBe("loud");
  });

  it("ignores an unknown LOG_LEVEL value", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    createLogger("jobs").info("still logged");
    expect(lines).toHaveLength(1);
  });
});
