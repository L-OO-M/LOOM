/**
 * Origin checks for cookie-authenticated mutations.
 *
 * SameSite=Lax/Strict cookies stop most cross-site form posts, but they are one
 * layer. This helper rejects an unsafe /api request whose browser-supplied
 * Origin (or, when Origin is absent, Referer) does not match the request host or
 * a configured app origin.
 *
 * Browser requests carry Origin on every unsafe method, so a foreign site
 * cannot forge a matching value. A request with neither Origin nor Referer is
 * treated as non-browser (curl, server-to-server); it cannot be made by a
 * victim's browser automatically and is not a CSRF vector. HMAC-verified
 * webhooks are exempt because GitHub does not send a browser Origin.
 */

export const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Only routes that authenticate by signed payload instead of a cookie. Keep
// this list explicit: a new machine route must be added here deliberately.
const CSRF_EXEMPT_PATHS = new Set([
  "/api/github/webhook",
  "/api/webhook"
]);

function normalizePath(pathname) {
  const raw = String(pathname || "");
  return raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
}

export function isCsrfExempt(pathname) {
  return CSRF_EXEMPT_PATHS.has(normalizePath(pathname));
}

function hostOf(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function expectedHosts(request) {
  const hosts = new Set();
  const fromHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (fromHeader) {
    // x-forwarded-host can be a comma-separated chain; the first entry is the
    // public host the browser addressed.
    hosts.add(fromHeader.split(",")[0].trim().toLowerCase());
  }
  const requestUrl = request.nextUrl?.origin || request.url;
  const fromUrl = hostOf(requestUrl);
  if (fromUrl) hosts.add(fromUrl);
  for (const value of [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_BASE_URL]) {
    const host = hostOf(value);
    if (host) hosts.add(host);
  }
  return hosts;
}

/**
 * @param {Request} request
 * @returns {{ ok: true, reason?: string } | { ok: false, reason: string }}
 */
export function checkSameOrigin(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (!UNSAFE_METHODS.has(method)) return { ok: true, reason: "safe-method" };

  const pathname = request.nextUrl?.pathname || new URL(request.url).pathname;
  if (isCsrfExempt(pathname)) return { ok: true, reason: "signed-webhook" };

  const hosts = expectedHosts(request);
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === "null") return { ok: false, reason: "null-origin" };
    const originHost = hostOf(origin);
    if (originHost && hosts.has(originHost)) return { ok: true, reason: "same-origin" };
    return { ok: false, reason: "foreign-origin" };
  }

  const referer = request.headers.get("referer");
  if (referer) {
    const refererHost = hostOf(referer);
    if (refererHost && hosts.has(refererHost)) return { ok: true, reason: "same-referer" };
    return { ok: false, reason: "foreign-referer" };
  }

  // No browser provenance headers. A victim's browser cannot be driven to send
  // this without an Origin, so it is not same-site-cookie CSRF.
  return { ok: true, reason: "no-browser-origin" };
}
