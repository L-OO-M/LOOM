// Structured, correlation-aware logging.
//
// One emitters, one JSON line per event, so a log aggregator (or `jq`) can read
// it without a parser plugin. The logger's most important job is redaction:
// request handlers routinely hold bearer tokens, cron secrets and cookies, and
// none of those may ever reach a log line.
//
// Server-only. Do not import from a client component.

import { randomBytes } from "node:crypto";

export const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

const DEFAULT_LEVEL = "info";
const REDACTED = "[redacted]";
const MAX_DEPTH = 6;

// Matches password/pass, secret, token, authorization, cookie, api-key/api_key/
// apiKey and anything containing "session" (sessionId, sessionToken, ...).
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|session/i;

/** A short (12 hex char) random id for one request or job run. */
export function newRequestId() {
  return randomBytes(6).toString("hex");
}

/** Read one header from a Request, Headers instance, or plain object. */
function readHeader(request, name) {
  if (!request || typeof request !== "object") return "";
  const headers = request.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return String(headers.get(name) ?? "").trim();
  }
  if (typeof headers === "object") {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
    return key ? String(headers[key] ?? "").trim() : "";
  }
  return "";
}

/**
 * Correlation id for a request: reuse the platform/proxy id when present so a
 * line joins up with the edge logs, otherwise mint one. Tolerates `undefined`
 * and non-Request objects (cron callers, tests).
 */
export function requestIdFrom(request) {
  const supplied = readHeader(request, "x-request-id") || readHeader(request, "x-vercel-id");
  return supplied.slice(0, 128) || newRequestId();
}

function errorFields(error) {
  if (!(error instanceof Error)) return String(error);
  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}

// Recursively mask secret-bearing keys and make the value JSON-safe. Errors are
// flattened to {name,message,stack} because an Error serialises to "{}".
function redactValue(value, depth, seen) {
  if (value instanceof Error) return errorFields(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_DEPTH) return "[depth-limit]";
  if (seen.has(value)) return "[circular]";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => redactValue(item, depth + 1, seen));
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    // Class instances (Request, Buffer, sql results, ...) may carry opaque or
    // huge state. Name them instead of dumping them.
    return `[${value.constructor?.name || "object"}]`;
  }
  seen.add(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : redactValue(item, depth + 1, seen);
  }
  return out;
}

function redact(fields) {
  return redactValue(fields, 0, new WeakSet());
}

function minLevel() {
  const configured = String(process.env.LOG_LEVEL || "").toLowerCase();
  return LEVELS[configured] ?? LEVELS[DEFAULT_LEVEL];
}

function stringify(line) {
  try {
    return JSON.stringify(line, (_key, value) => (typeof value === "bigint" ? String(value) : value));
  } catch {
    return JSON.stringify({
      level: line.level,
      scope: line.scope,
      msg: line.msg,
      ts: line.ts,
      requestId: line.requestId,
      logError: "unserializable fields"
    });
  }
}

/**
 * Create a scoped logger.
 *
 *   const log = createLogger("jobs", { requestId, job: "analytics-rollup" });
 *   log.info("completed", { durationMs: 42 });
 *   const child = log.child({ job: "retention-prune" });
 *
 * Every call emits exactly one JSON line via console.<level>.
 */
export function createLogger(scope, { requestId, ...base } = {}) {
  const context = { ...base };
  const scopeName = String(scope ?? "app");

  function emit(level, msg, fields = {}) {
    if (LEVELS[level] < minLevel()) return;

    const line = {
      ...redact({ ...context, ...fields }),
      level,
      scope: scopeName,
      msg: String(msg ?? ""),
      ts: new Date().toISOString(),
      ...(requestId ? { requestId } : {})
    };

    const write = level === "error" ? console.error
      : level === "warn" ? console.warn
        : level === "debug" ? console.debug
          : console.info;
    // A logger must never be the reason a request fails: callers now log from
    // inside catch blocks that deliberately keep the request alive. If the
    // console itself throws (a patched or torn-down console), drop the line.
    try {
      write.call(console, stringify(line));
    } catch { /* no further place to report it */ }
  }

  return {
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    debug: (msg, fields) => emit("debug", msg, fields),
    /**
     * New logger with merged fields. `scope` in `fields` renames the scope;
     * the original scope is kept otherwise.
     */
    child: (fields = {}) => {
      const { scope: childScope, ...rest } = fields || {};
      return createLogger(childScope ?? scopeName, { requestId, ...context, ...rest });
    }
  };
}
