// Rate limiting with two backends:
//
//   1. In-memory token bucket per instance. Always available, and the fallback
//      when no shared store is configured.
//   2. Upstash Redis (HTTP REST) when UPSTASH_REDIS_REST_URL and
//      UPSTASH_REDIS_REST_TOKEN are set. Counters are shared across instances
//      and survive cold starts, so a deployment with more than one function
//      instance enforces one budget instead of one per instance.
//
// The synchronous in-memory shape is kept because most existing callers use it
// directly. A caller opts into the durable backend with `{ durable: true }` and
// awaits the result; `await` on the synchronous fallback is harmless.
//
// The Redis path uses a single Lua EVAL so INCR + PEXPIRE are atomic: a counter
// can never be created without a TTL, and two instances cannot race the expiry.
const buckets = new Map(); // key -> { tokens, resetAt }

const REDIS_LUA = [
  "local c = redis.call('INCR', KEYS[1])",
  "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "return {c, redis.call('PTTL', KEYS[1])}"
].join("\n");

function keyFor(request, userId) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";
  return userId ? `u:${userId}` : `ip:${ip}`;
}

// Two call shapes are supported:
//   checkRateLimit(request, { userId, limit, windowMs })  -> derived ip/user + path
//   checkRateLimit("github:<tenantId>", { limit, windowMs }) -> explicit caller key
// The string form predates the Request form and is still used by the GitHub
// webhook, which has no meaningful user and must be limited per tenant.
function buildKey(requestOrKey, userId) {
  const isRequest = typeof requestOrKey === "object" && requestOrKey !== null && typeof requestOrKey.headers === "object";
  return isRequest
    ? keyFor(requestOrKey, userId) + `:${requestOrKey.nextUrl?.pathname || requestOrKey.url || "global"}`
    : `k:${String(requestOrKey)}`;
}

function localCheck(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { tokens: limit - 1, resetAt: now + windowMs };
    buckets.set(key, b);
    return { ok: true, remaining: b.tokens, resetAt: b.resetAt, backend: "memory" };
  }
  if (b.tokens <= 0) {
    return {
      ok: false,
      remaining: 0,
      resetAt: b.resetAt,
      retryAfter: Math.ceil((b.resetAt - now) / 1000),
      backend: "memory"
    };
  }
  b.tokens -= 1;
  return { ok: true, remaining: b.tokens, resetAt: b.resetAt, backend: "memory" };
}

export function durableRateLimitConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function redisCheck(key, limit, windowMs) {
  const url = String(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(["EVAL", REDIS_LUA, "1", `rl:${key}`, String(windowMs)]),
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`redis status ${res.status}`);
    const payload = await res.json();
    if (payload?.error) throw new Error("redis command failed");
    const raw = Array.isArray(payload?.result) ? payload.result : [payload?.result, windowMs];
    const count = Number(raw[0]);
    const ttl = Number(raw[1]);
    if (!Number.isFinite(count)) throw new Error("redis returned no counter");
    const ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs;
    const resetAt = Date.now() + ttlMs;
    if (count > limit) {
      return {
        ok: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.max(1, Math.ceil(ttlMs / 1000)),
        backend: "redis"
      };
    }
    return {
      ok: true,
      remaining: Math.max(0, limit - count),
      resetAt,
      backend: "redis"
    };
  } catch {
    // A shared-store outage must not take auth down. Fall back to the local
    // bucket for this instance; the next request retries Redis.
    return localCheck(key, limit, windowMs);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {Request|string} requestOrKey
 * @param {{ userId?: string|null, limit?: number, windowMs?: number, durable?: boolean }} options
 * @returns {{ ok: boolean, remaining: number, resetAt: number, retryAfter?: number, backend: string } | Promise<...>}
 */
export function checkRateLimit(requestOrKey, options = {}) {
  const { userId = null, limit = 60, windowMs = 60_000, durable = false } = options;
  const key = buildKey(requestOrKey, userId);

  if (durable && durableRateLimitConfigured()) {
    return redisCheck(key, limit, windowMs);
  }
  return localCheck(key, limit, windowMs);
}

export function rateLimitResponse(retryAfter) {
  return { ok: false, error: { code: "RATE_LIMITED", message: `Too many requests. Retry after ${retryAfter}s` } };
}

/** Test-only: clear the in-memory buckets so cases do not leak into each other. */
export function __resetRateLimitMemory() {
  buckets.clear();
}

// Cleanup every 5min to avoid memory leak
if (typeof setInterval !== "undefined" && !globalThis.__rlCleanup) {
  globalThis.__rlCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }, 5 * 60_000);
  if (globalThis.__rlCleanup.unref) globalThis.__rlCleanup.unref();
}
