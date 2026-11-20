import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { checkSameOrigin, UNSAFE_METHODS } from "@/lib/csrf";
import { checkBodySize } from "@/lib/request-limits";
import { buildCsp, createNonce } from "@/lib/csp";

// Paths owned by the Auth0 SDK's middleware (login, logout, OAuth callback,
// profile, token). They MUST be delegated to the SDK -- treating them as public
// (a plain NextResponse.next()) would skip the OAuth code exchange entirely.
//
// /auth/callback is Auth0's. The retired Supabase PKCE callback now lives at
// /auth/supabase-callback and only redirects to /login?error=auth0_only.
const AUTH0_PATHS = new Set([
  "/auth/login",
  "/auth/logout",
  "/auth/callback",
  "/auth/profile",
  "/auth/access-token",
  "/auth/backchannel-logout"
]);

// Machine-readable SEO files. They bypass auth (crawlers arrive anonymous) but
// still need the CSP header, which is no longer emitted by next.config.mjs.
const SEO_TEXT_PATHS = new Set(["/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt"]);

const publicPaths = [
  "/",
  "/about",
  "/faq",
  "/events",
  "/privacy",
  "/cookies",
  "/terms",
  "/disclaimer",
  "/contact",
  "/login",
  "/register",
  "/setup",
  // A suspended/deactivated member still has a valid session cookie. The app
  // layouts send them here, so this page must render without a session-scoped
  // request context (it is noindex and shows only the generic status copy).
  "/account-status",
  // Sign-out is a POST from the app chrome. It must reach its handler without a
  // session check: its entire job is to clear the session(s), and the middleware
  // gate would otherwise 307 it to /login before it ever ran.
  "/auth/signout",
  "/auth/supabase-callback",
  "/api/health",
  "/api/chapters",
  // Credential endpoints. These MUST be reachable without a session -- that is
  // the whole point -- and they are rate limited inside their own handlers.
  // Leaving them out made every login attempt return the middleware's generic
  // 401 before the route could run.
  "/api/auth/login",
  "/api/auth/register",
  // Email verification link. Opened from an inbox, often without a session and
  // frequently in a different browser -- the token is the credential, and the
  // handler validates, expires and single-uses it.
  "/api/auth/verify-email/confirm",
  "/verify-email",
  // Client-side "who am I" probe. Public so logged-out visitors get a 200 with
  // signedIn:false instead of the middleware's machine 401.
  "/api/auth/state",
  // Public provider-capability probe used by the auth screens before starting
  // OAuth. Contains no user data; gating it would make logged-out visitors get
  // the machine 401 and defeat the check.
  "/api/auth/providers",
  "/api/public/events",
  "/api/public/projects",
  "/api/public/departments",
  // Advertised in /llms.txt as the aggregate answer-engine endpoint. It was
  // missing from this list, so the middleware returned a machine 401 to the
  // anonymous crawlers the file invites.
  "/api/public/summary",
  "/api/admin/check-setup",
  "/api/admin/claim-first",
  "/api/github/webhook",
  // Alias of /api/github/webhook (see app/api/webhook/route.js). GitHub hooks
  // configured with /api/webhook were being auth-gated here and 401'd.
  "/api/webhook"
];

export async function middleware(request) {
  const raw = request.nextUrl.pathname;
  const pathname = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;

  // Per-request CSP. The nonce is generated here because it has to be unique
  // for every response, and the policy is built only after it exists. Next
  // reads the nonce out of the `Content-Security-Policy` REQUEST header during
  // rendering and stamps it onto its own inline bootstrap/flight scripts, so
  // the header must travel on the request as well as the response -- that is
  // the whole mechanism behind `script-src` no longer needing 'unsafe-inline'.
  const nonce = createNonce();
  const contentSecurityPolicy = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development"
  });

  // The student layout must gate first-run onboarding, but it has no pathname of
  // its own and the onboarding route lives under that same layout — so it has to
  // know the current path to avoid redirecting the onboarding page to itself.
  // Forward it as a request header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  // Every response leaves through here. Redirects, machine 401/403 payloads and
  // auth0's responses get the same policy as rendered pages, so no path can
  // fall back to Next's default (unrestricted) header set.
  const withCsp = (response) => {
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return response;
  };

  // SEO text files are advertised in /llms.txt and fetched by anonymous
  // crawlers. They are plain text/XML, not HTML, so there is no inline script to
  // nonce -- but the CSP now lives here instead of next.config.mjs, and these
  // paths have to keep the same header contract as every other response.
  // This branch runs before auth so a crawler can never be redirected to /login.
  if (SEO_TEXT_PATHS.has(pathname) || pathname.endsWith(".txt")) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // CSRF/origin gate for cookie-authenticated mutations. Runs before auth so a
  // foreign-origin write is rejected even if the session would otherwise pass.
  // Signed webhooks are exempt inside checkSameOrigin.
  if (pathname.startsWith("/api/") && UNSAFE_METHODS.has(request.method.toUpperCase())) {
    const originCheck = checkSameOrigin(request);
    if (!originCheck.ok) {
      return withCsp(
        NextResponse.json(
          {
            ok: false,
            error: {
              code: "CSRF_ORIGIN_REJECTED",
              message: "Cross-origin request rejected"
            }
          },
          { status: 403 }
        )
      );
    }

    // Body size, before any handler can buffer it. `request.json()` and
    // `request.formData()` read the whole payload into memory BEFORE validation
    // runs, so a schema max-length does not protect the process.
    const size = checkBodySize(request, pathname);
    if (!size.ok) {
      return withCsp(
        NextResponse.json(
          {
            ok: false,
            error: {
              code: size.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_CONTENT_LENGTH",
              message:
                size.status === 413
                  ? "Request body is too large"
                  : "Content-Length is not a valid byte count"
            }
          },
          { status: size.status }
        )
      );
    }
  }

  // Auth0 front door: hand its routes to the SDK before anything else. The SDK
  // performs the login redirect, the OAuth exchange, and session refresh; if the
  // request reaches the gating logic below it would be treated as an app page
  // and (for logged-out users) bounced to /login instead of completing auth.
  //
  // `auth0` is null only when the Auth0 env vars are not configured (see
  // lib/auth0.js). In that case these paths fall through to the gate below,
  // which fails closed: an unconfigured deployment has no session source at all.
  if (auth0 && AUTH0_PATHS.has(pathname)) {
    return withCsp(await auth0.middleware(request));
  }

  // Exact-match public pages; /api/* is NOT blanket-public (only listed routes).
  if (publicPaths.includes(pathname)) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Public credential verification links: /verify/credential/<id>
  if (pathname === "/verify" || pathname.startsWith("/verify/")) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Public shareable profiles: /u/<username> + OG images
  if (pathname === "/u" || pathname.startsWith("/u/")) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }
  if (pathname.startsWith("/api/og/")) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Public department pages: /domains/<slug> (active departments only;
  // the page itself returns an honest empty state for unknown slugs).
  if (pathname === "/domains" || pathname.startsWith("/domains/")) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Public event detail pages: /events/<id>. The exact "/events" entry above
  // does NOT cover these -- middleware matches by exact string, so without this
  // branch every event detail page auth-gated logged-out visitors to /login.
  // That is backwards: the page exists to recruit people who have no account.
  if (pathname.startsWith("/events/")) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Session read + REFRESH.
  //
  // Auth0 is the only identity provider. The Supabase branch that used to live
  // here is gone: the anon key is public, so while Supabase's own signup was
  // reachable anyone could mint a Supabase user and have this middleware treat
  // the resulting cookie as a valid session. Authentication is now one door.
  //
  // Auth0's own middleware is invoked for the request so ROLLING sessions work:
  // its default branch (no auth route matched) re-issues the session cookie with
  // a fresh maxAge. Only /auth/* used to be delegated, which meant the cookie
  // was never rolled on app pages and users silently expired after the
  // inactivity window.
  let auth0Session = null;
  if (auth0) {
    try {
      auth0Session = await auth0.getSession(request);
    } catch {
      // A corrupt/undecryptable cookie is "not signed in", never a 500.
      auth0Session = null;
    }
  }

  if (auth0Session?.user) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    try {
      const rolled = await auth0.middleware(request);
      for (const cookie of rolled.cookies.getAll()) res.cookies.set(cookie);
      // Carry the SDK's cache-control (no-store for session responses) so a
      // CDN or the browser does not cache an authenticated page.
      const cacheControl = rolled.headers.get("cache-control");
      if (cacheControl) res.headers.set("cache-control", cacheControl);
    } catch {
      /* rolling is best-effort; the session is still valid for this request */
    }
    return withCsp(res);
  }

  // No session. API routes get machine-readable 401; pages get a login redirect.
  //
  // `auth0` being null (unconfigured) lands here too: with no identity provider
  // there is no session that could be valid, so fail closed rather than open.
  if (pathname.startsWith("/api/")) {
    return withCsp(
      NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      )
    );
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return withCsp(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: [
    // Never auth-gate framework internals or any static asset in public/
    // (logo, icons, og image, fonts). Without the extension branch, requests like
    // /logo.png fall through to the login redirect and return HTML instead of the file.
    //
    // `html` is excluded for the Search Console verification file
    // (public/google<token>.html). Google fetches it as an anonymous crawler;
    // auth-gating it returned a login redirect, so verification silently failed.
    //
    // sitemap.xml, robots.txt and *.txt are NOT excluded: they used to be, but
    // the CSP moved from next.config.mjs into this middleware, and excluded paths
    // stopped carrying it. They return early as public above, so the crawler
    // contract is unchanged.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|html|woff2?)$).*)"
  ]
};