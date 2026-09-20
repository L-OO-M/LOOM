// In-memory token bucket per instance. For single-instance Next.js this is sufficient;
// for multi-instance, replace with postgres/redis check (pg table rate_limits).
const buckets = new Map(); // key -> { tokens, resetAt }

function keyFor(request, userId) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";
  return userId ? `u:${userId}` : `ip:${ip}`;
}

export function checkRateLimit(request, { userId = null, limit = 60, windowMs = 60_000 } = {}) {
  const key = keyFor(request, userId) + `:${request.nextUrl?.pathname || request.url || "global"}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { tokens: limit - 1, resetAt: now + windowMs };
    buckets.set(key, b);
    return { ok: true, remaining: b.tokens, resetAt: b.resetAt };
  }
  if (b.tokens <= 0) {
    return { ok: false, remaining: 0, resetAt: b.resetAt, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.tokens -= 1;
  return { ok: true, remaining: b.tokens, resetAt: b.resetAt };
}

export function rateLimitResponse(retryAfter) {
  return { ok: false, error: { code: "RATE_LIMITED", message: `Too many requests. Retry after ${retryAfter}s` } };
}

// Cleanup every 5min to avoid memory leak
if (typeof setInterval !== "undefined" && !globalThis.__rlCleanup) {
  globalThis.__rlCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }, 5 * 60_000);
  if (globalThis.__rlCleanup.unref) globalThis.__rlCleanup.unref();
}
