/**
 * Request body size limits, enforced in middleware before a route handler can
 * buffer the payload.
 *
 * Why this exists: route handlers call `request.json()` / `request.formData()`,
 * and those buffer the ENTIRE body in memory before validation runs. A zod
 * schema with `z.string().max(200)` does not stop a 200 MB string from being
 * allocated first. Verified before this guard: a 6 MB JSON body to
 * `/api/auth/login` was accepted and fully parsed (400 VALIDATION_ERROR, not
 * 413). A handful of concurrent large POSTs is enough to exhaust a small
 * instance, which is a cheap denial-of-service.
 *
 * Attacker can still use `Transfer-Encoding: chunked` with no declared length;
 * that residual risk is why the deployment guide asks for a proxy-level body
 * limit as well. This guard removes the trivial declared-length variant.
 */

/** Default cap for JSON APIs. Real payloads in this app are a few KB. */
export const JSON_BODY_LIMIT = 1 * 1024 * 1024; // 1 MB

/** Multipart/document routes. Must stay above MAX_UPLOAD_BYTES (25 MB) + form overhead. */
export const UPLOAD_BODY_LIMIT = 27 * 1024 * 1024; // 27 MB

// Routes that legitimately carry a file. Kept as an explicit allowlist: a new
// upload route must be added here deliberately, exactly like CSRF_EXEMPT_PATHS.
const UPLOAD_PATHS = [
  /^\/api\/lead\/assets$/,
  /^\/api\/lead\/assets\/[^/]+\/versions$/,
  /^\/api\/lead\/mous\/[^/]+\/documents$/
];

// GitHub caps a delivery at 25 MB and signs the raw bytes; the handler needs
// the body intact to verify the HMAC, so these get the large cap too.
const SIGNED_WEBHOOK_PATHS = new Set(["/api/github/webhook", "/api/webhook"]);

function normalize(pathname) {
  const raw = String(pathname || "");
  return raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
}

/** Byte cap for a request path. */
export function bodyLimitFor(pathname) {
  const path = normalize(pathname);
  if (UPLOAD_PATHS.some((pattern) => pattern.test(path))) return UPLOAD_BODY_LIMIT;
  if (SIGNED_WEBHOOK_PATHS.has(path)) return UPLOAD_BODY_LIMIT;
  return JSON_BODY_LIMIT;
}

/**
 * Check a request's declared length against its path's cap.
 *
 * @param {{ headers: Headers, method?: string, nextUrl?: { pathname: string } }} request
 * @returns {{ ok: true, limit: number, declared: number|null } | { ok: false, limit: number, declared: number|null, status: number }}
 */
export function checkBodySize(request, pathname) {
  const limit = bodyLimitFor(pathname);
  const raw = request.headers.get("content-length");
  if (raw == null) {
    // Chunked or empty body: nothing to compare. The route still validates.
    return { ok: true, limit, declared: null };
  }
  const declared = Number(raw);
  if (!Number.isFinite(declared) || declared < 0) {
    // A malformed length is not a payload we should try to parse.
    return { ok: false, limit, declared: null, status: 400 };
  }
  if (declared > limit) {
    return { ok: false, limit, declared, status: 413 };
  }
  return { ok: true, limit, declared };
}
